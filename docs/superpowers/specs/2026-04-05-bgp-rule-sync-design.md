# BGP Rule Sync Design

## Overview

通过 BGP 协议在 Tailscale 网络中的多个 Calamity 实例之间同步路由规则（rules.json）。

**Phase 1（当前）**：手动拉取 — 用户主动从另一个 Calamity 实例拉取规则，确认后导入。
**Phase 2（未来）**：自动同步 — BGP session 保持，规则变更时自动推送增量更新。

## 同步范围

仅同步路由规则（`rules.json`），不包括节点、订阅、DNS、设置等其他配置。

## BGP 协议设计

### Session 层

- 每个 Calamity 实例内嵌一个轻量 BGP speaker
- 监听地址：`<tailscale_ip>:179`（BGP 标准端口）
- 所有实例使用固定私有 ASN `64512`，采用 iBGP 模式
- BGP Router ID 使用 Tailscale IP

### 协议库

使用 [rustybgp](https://github.com/osrg/rustybgp) 的 `rustybgp-packet` crate 处理 BGP 消息编解码，自行实现：

- 轻量 BGP FSM（Idle → Connect → OpenSent → OpenConfirm → Established）
- TCP session 管理（基于 tokio）
- 自定义 AFI/SAFI 编解码
- Keepalive 定时器（默认 60s hold time, 20s keepalive interval）

### 规则编码

定义自定义 Address Family：**AFI=99, SAFI=1**（私有范围）。

每条路由规则编码为一个 BGP UPDATE 中的 NLRI entry：

| 规则字段 | BGP 编码 |
|---------|---------|
| `id` | NLRI key（UTF-8 bytes, length-prefixed） |
| `name` | Path Attribute (type=200) |
| `enabled` | Path Attribute (type=201), 1 byte boolean |
| `match_type` | Path Attribute (type=202), UTF-8 |
| `match_value` | Path Attribute (type=203), UTF-8 |
| `outbound` | Path Attribute (type=204), UTF-8 |
| `outbound_node` | Path Attribute (type=205), UTF-8, optional |
| `rule_set_url` | Path Attribute (type=206), UTF-8, optional |
| `download_detour` | Path Attribute (type=207), UTF-8, optional |
| `invert` | Path Attribute (type=208), 1 byte boolean |
| `order` | Path Attribute (type=209), u32 big-endian |
| `final_outbound` | Path Attribute (type=210), UTF-8（仅一条特殊 NLRI 携带）|

规则删除通过 BGP WITHDRAW 消息实现（按 NLRI key 撤回）。

## Peer 发现与管理

### 自动发现

通过 Tailscale API 获取 tailnet 设备列表，过滤 hostname 包含 "calamity" 的设备，自动添加为候选 peer。

### 手动添加

用户输入对方 Tailscale IP，手动添加 peer。

### 存储

新增 `bgp.json` 配置文件：

```json
{
  "enabled": false,
  "peers": [
    {
      "id": "uuid-string",
      "name": "客厅 Mac Mini",
      "address": "100.64.0.2",
      "auto_discovered": true
    }
  ]
}
```

ASN、Router ID、端口等对用户完全透明，无需配置。

## 安全

- BGP speaker 仅绑定 Tailscale 网络接口，外网不可达
- Tailscale 提供端到端加密和身份认证
- 可选 BGP MD5 TCP 认证（后续按需添加）
- Phase 1 拉取规则需要用户手动确认 diff 后才应用

## Rust 模块结构

```
src-tauri/src/singbox/
├── bgp/
│   ├── mod.rs          # 模块入口，启动/停止 BGP speaker
│   ├── speaker.rs      # BGP speaker：监听、accept、管理 peer sessions
│   ├── fsm.rs          # BGP FSM 状态机（per-peer）
│   ├── codec.rs        # 规则 ↔ NLRI+Attributes 编解码
│   ├── peer.rs         # Peer 连接管理、reconnect 逻辑
│   └── storage.rs      # bgp.json 读写
```

## 前端 UI

在设置页面新增「规则同步」区域：

### Peer 列表

| 列 | 说明 |
|----|------|
| 设备名 | Tailscale hostname 或用户自定义名称 |
| Tailscale IP | peer 地址 |
| 状态 | Established / Connecting / Idle |
| 操作 | 「拉取规则」按钮 / 删除 peer |

### 拉取流程（Phase 1）

1. 用户点击某个 peer 的「拉取规则」
2. Calamity 建立 BGP session，接收全量 UPDATE
3. 弹出 diff 对话框：显示新增/删除/修改的规则
4. 用户确认 → 应用规则 → 重新生成 sing-box 配置 → reload
5. 断开 BGP session

### 自动发现

- 「扫描 Tailnet」按钮，列出发现的 Calamity 实例
- 点击即可添加为 peer

## Tauri Commands

```rust
// BGP 管理
#[tauri::command] async fn bgp_get_settings() -> Result<BgpSettings, String>
#[tauri::command] async fn bgp_set_enabled(enabled: bool) -> Result<(), String>
#[tauri::command] async fn bgp_add_peer(name: String, address: String) -> Result<(), String>
#[tauri::command] async fn bgp_remove_peer(id: String) -> Result<(), String>
#[tauri::command] async fn bgp_get_peer_status() -> Result<Vec<PeerStatus>, String>

// 规则拉取
#[tauri::command] async fn bgp_pull_rules(peer_id: String) -> Result<RuleDiff, String>
#[tauri::command] async fn bgp_apply_rules(diff: RuleDiff) -> Result<(), String>

// 发现
#[tauri::command] async fn bgp_discover_peers() -> Result<Vec<DiscoveredPeer>, String>
```

## Phase 2 扩展点（未来）

- BGP session 保持，实时接收 UPDATE 自动应用
- 冲突解决策略（时间戳优先 / 手动选择）
- 选择性同步（只同步特定 tag 的规则）
- 多向同步（任意节点修改都传播到其他节点）
