<h1 align="center">
  <img src="./docs/screenshots/logo.png" alt="Calamity" width="150" />
  <br>
  Calamity
</h1>

<h3 align="center">
基于 <a href="https://sing-box.sagernet.org/">sing-box</a> 的现代 macOS 代理客户端
</h3>

<p align="center">
  <a href="./README.md">English</a>
  &nbsp;|&nbsp;
  <a href="./README.zh-CN.md">简体中文</a>
</p>

---

## 预览

<table>
  <tr>
    <td><img src="./docs/screenshots/dashboard-light.png" alt="仪表盘 亮色" width="550" /></td>
    <td><img src="./docs/screenshots/dashboard-dark.png" alt="仪表盘 暗色" width="550" /></td>
  </tr>
  <tr>
    <td align="center"><strong>仪表盘</strong> — 亮色模式</td>
    <td align="center"><strong>仪表盘</strong> — 暗色模式</td>
  </tr>
  <tr>
    <td><img src="./docs/screenshots/nodes.png" alt="节点" width="550" /></td>
    <td><img src="./docs/screenshots/rules.png" alt="规则" width="550" /></td>
  </tr>
  <tr>
    <td align="center"><strong>节点</strong> — 代理分组与节点管理</td>
    <td align="center"><strong>规则</strong> — 路由规则与规则集</td>
  </tr>
  <tr>
    <td><img src="./docs/screenshots/subscriptions.png" alt="订阅" width="550" /></td>
    <td><img src="./docs/screenshots/tray.png" alt="托盘" width="550" /></td>
  </tr>
  <tr>
    <td align="center"><strong>订阅</strong> — 节点订阅管理</td>
    <td align="center"><strong>托盘</strong> — 紧凑快捷窗口</td>
  </tr>
</table>

## 功能特性

**代理核心**

- 三种连接模式：直连、规则、全局代理
- 节点分组与延迟测试（单点 / 批量）
- 代理链支持 — 多节点串联
- 丰富协议支持：VMess、VLESS、Shadowsocks、Trojan、Reality 等

**规则路由**

- 灵活的规则匹配：域名、IP、GeoSite、GeoIP
- 规则反转、Final 出口、按站点快速操作
- 规则集市场 — 一键安装社区规则集

**DNS 管理**

- 完整的 DNS 服务器管理与自定义上游
- TUN 模式下的 Fake-IP 支持
- 根据路由配置自动生成 DNS 分流规则
- DNS 劫持支持（sing-box 1.12+）

**TUN 模式**

- 原生 macOS TUN，自动处理管理员权限
- 可配置 stack、MTU、auto-route、strict-route、DNS 劫持
- 退出时自动清理 Fake-IP 并释放 TUN 接口

**网关模式**

- 透明局域网网关 — 其他设备将 Mac 设为网关即可代理所有流量
- pf route-to 强制转发流量进入 sing-box TUN 进行完整代理处理
- Fake-IP DNS（198.18.0.2）实现零延迟域名解析和智能分流
- Tailscale SNAT — 局域网设备可访问 Tailscale 节点，自动处理回程路由
- TCP MSS 钳位，Tailscale 降低 MTU 时避免分片
- 合盖防休眠，确保网关持续运行
- 一键开关，退出时自动清理

**规则同步 (BGP)**

- 通过 Tailscale 网络在多个 Calamity 实例之间同步路由规则
- 内置轻量 BGP speaker，��用自定义 AFI/SAFI 编码规则
- 自动发现 Tailnet 中的其他 Calamity 设备，或手动添加节点
- 拉取规则前预览差异 — 查看新增、删除、修改的规则后再应用
- 第一阶段：手动拉取；第二阶段（计划��）：持久会话自动同步

**订阅管理**

- 多订阅管理，支持自动更新
- Clash YAML 订阅解析
- 并发拉取，共享 HTTP 客户端

**Tailscale 集成**

- OAuth 设备管理
- 出口节点切换、ACL 标签、MagicDNS 支持
- 自动注入 Tailscale 路由和 DNS 规则到 sing-box 配置

**界面体验**

- 实时流量图表、速度、内存、连接数仪表盘
- 紧凑托盘窗口，快速切换模式和状态监控
- 暗色主题，毛玻璃效果
- 中英双语界面
- 拖拽排序规则和节点

## 安装

| 系统 | 架构 | 最低版本 |
|:---|:---|:---|
| macOS | Apple Silicon (aarch64) | macOS 10.15+ |

前往 [**Releases**](https://github.com/Kotodian/calamity/releases) 下载最新 `.dmg` 安装包。

> **注意**：安装后 macOS 可能会阻止运行。右键选择"打开"以跳过 Gatekeeper，或执行：
> ```bash
> xattr -cr /Applications/Calamity.app
> ```

## 技术栈

| 层级 | 技术 |
|:---|:---|
| 前端 | React 19, TypeScript 6, Vite 8, Tailwind CSS 4 |
| 状态管理 | Zustand |
| UI 组件 | shadcn/ui (Radix UI) |
| 图表 | Recharts |
| 国际化 | i18next |
| 桌面框架 | Tauri 2 |
| 后端 | Rust 2021, Tokio |
| 代理核心 | sing-box (sidecar) |
| 测试 | Vitest, React Testing Library |

## 开发

### 前置条件

- macOS
- Node.js 20+
- Rust 工具链
- Tauri CLI (`cargo install tauri-cli`)
- `sing-box` 可执行文件在 `PATH` 中

### 快速开始

```bash
# 克隆仓库
git clone https://github.com/Kotodian/calamity.git
cd calamity

# 安装依赖
npm install

# 仅启动前端（localhost:1420）
npm run dev

# 启动完整桌面应用
npm run tauri dev

# 构建
npm run build

# 测试
npm test                                          # 前端 (Vitest)
cargo test --manifest-path src-tauri/Cargo.toml   # 后端 (Rust)
```

### 项目结构

```
calamity/
├── src/                    # React/TypeScript 前端
│   ├── pages/              # 仪表盘、节点、规则、DNS、设置等页面
│   ├── tray/               # 托盘窗口组件
│   ├── stores/             # Zustand 状态管理
│   ├── services/           # Tauri 命令适配器
│   ├── components/         # 共享 UI 组件 (shadcn/ui)
│   ├── i18n/               # 中英双语翻译
│   └── lib/                # 工具函数
├── src-tauri/              # Tauri + Rust 后端
│   └── src/
│       ├── commands/       # 15 个 Tauri 命令模块
│       └── singbox/        # sing-box 配置、进程、存储、API
├── docs/                   # 文档与截图
├── tailscale/              # Tailscale 集成资源
├── index.html              # 主窗口入口
└── tray.html               # 托盘窗口入口
```

## 路线图

- [x] TUN 模式与 Fake-IP
- [x] Tailscale 原生集成
- [x] 规则集市场
- [x] DNS 自动分流规则生成
- [x] 并发订阅拉取
- [x] 网关模式（透明局域网代理）
- [x] BGP 规则同步（第一阶段：手动拉取）
- [ ] BGP 规则同步第二阶段：持久会话自动同步
- [ ] 配置热重载
- [ ] 版本化发布
- [ ] CLI 工具 (`calamity start/stop/restart/status`)
- [ ] MCP Server 集成，AI 辅助代理控制

## 致谢

- [sing-box](https://github.com/SagerNet/sing-box) — 通用代理平台
- [Tauri](https://tauri.app/) — 桌面应用框架
- [Clash Verge Rev](https://github.com/clash-verge-rev/clash-verge-rev) — UI/UX 设计灵感
- [Tailscale](https://tailscale.com/) — Mesh VPN 集成

## 贡献

贡献前请阅读 [AGENTS.md](./AGENTS.md)，了解仓库约定与代码规范。

## 许可证

[MIT License](./LICENSE) © 2026 Kotodian
