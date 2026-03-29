# Nodes Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up the existing Nodes UI to a real sing-box backend — persist nodes in `nodes.json`, generate proxy outbound configs, support urltest groups, test latency via Clash API, and replace the frontend mock service with Tauri invoke calls.

**Architecture:** New `nodes_storage.rs` handles node/group types and `nodes.json` persistence. New `outbounds.rs` converts stored nodes into sing-box outbound JSON objects. New `commands/nodes.rs` exposes Tauri commands for CRUD + latency testing. `config.rs` reads nodes and generates outbounds + route.final pointing to the active node. Frontend replaces mock service with Tauri invoke calls.

**Tech Stack:** Rust (serde, serde_json, reqwest), Tauri v2 commands, React + TypeScript, Zustand stores

---

## File Structure

### Backend (Rust)
| File | Action | Responsibility |
|------|--------|----------------|
| `src-tauri/src/singbox/nodes_storage.rs` | Create | Node/group types + `nodes.json` read/write |
| `src-tauri/src/singbox/outbounds.rs` | Create | Convert nodes → sing-box outbound JSON |
| `src-tauri/src/commands/nodes.rs` | Create | Tauri commands: CRUD, latency test |
| `src-tauri/src/singbox/mod.rs` | Modify | Add `pub mod nodes_storage; pub mod outbounds;` |
| `src-tauri/src/commands/mod.rs` | Modify | Add `pub mod nodes;` |
| `src-tauri/src/lib.rs` | Modify | Register node commands |
| `src-tauri/src/singbox/config.rs` | Modify | Include node outbounds in generated config |
| `src-tauri/src/singbox/clash_api.rs` | Modify | Add `test_delay` method |

### Frontend (TypeScript)
| File | Action | Responsibility |
|------|--------|----------------|
| `src/services/nodes.ts` | Modify | Add Tauri implementation alongside mock |

---

### Task 1: Rust Node Storage Types

**Files:**
- Create: `src-tauri/src/singbox/nodes_storage.rs`
- Modify: `src-tauri/src/singbox/mod.rs`

- [ ] **Step 1: Create `nodes_storage.rs`**

```rust
// src-tauri/src/singbox/nodes_storage.rs
use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::storage::{read_json, write_json};

const NODES_FILE: &str = "nodes.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NodesData {
    pub groups: Vec<NodeGroup>,
    pub active_node: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeGroup {
    pub id: String,
    pub name: String,
    #[serde(default = "default_group_type")]
    pub group_type: String, // "select" or "urltest"
    pub nodes: Vec<ProxyNode>,
}

fn default_group_type() -> String {
    "select".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxyNode {
    pub id: String,
    pub name: String,
    pub server: String,
    pub port: u16,
    pub protocol: String,
    pub country: String,
    pub country_code: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub protocol_config: Option<Value>,
}

impl Default for NodesData {
    fn default() -> Self {
        Self {
            groups: vec![
                NodeGroup {
                    id: "proxy".to_string(),
                    name: "Proxy".to_string(),
                    group_type: "select".to_string(),
                    nodes: vec![],
                },
            ],
            active_node: None,
        }
    }
}

pub fn load_nodes() -> NodesData {
    read_json(NODES_FILE)
}

pub fn save_nodes(data: &NodesData) -> Result<(), String> {
    write_json(NODES_FILE, data)
}
```

- [ ] **Step 2: Add module to `singbox/mod.rs`**

Add to `src-tauri/src/singbox/mod.rs`:
```rust
pub mod storage;
pub mod clash_api;
pub mod process;
pub mod config;
pub mod dns_storage;
pub mod nodes_storage;
pub mod outbounds;
```

- [ ] **Step 3: Create placeholder `outbounds.rs`**

```rust
// src-tauri/src/singbox/outbounds.rs
use serde_json::Value;

use super::nodes_storage::ProxyNode;

pub fn build_outbound(_node: &ProxyNode) -> Option<Value> {
    // Will be implemented in Task 2
    None
}
```

- [ ] **Step 4: Verify it compiles**

Run: `cargo check --manifest-path src-tauri/Cargo.toml 2>&1 | tail -5`
Expected: no errors (warnings about unused ok)

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/singbox/nodes_storage.rs src-tauri/src/singbox/outbounds.rs src-tauri/src/singbox/mod.rs
git commit -m "feat: add node storage types and persistence (nodes.json)"
```

---

### Task 2: Outbound Config Generation

**Files:**
- Modify: `src-tauri/src/singbox/outbounds.rs`

- [ ] **Step 1: Implement `build_outbound` for all protocols**

Replace `src-tauri/src/singbox/outbounds.rs`:

```rust
use serde_json::{json, Value};

use super::nodes_storage::ProxyNode;

pub fn build_outbound(node: &ProxyNode) -> Option<Value> {
    let config = node.protocol_config.as_ref()?;
    let config_obj = config.as_object()?;
    let proto_type = config_obj.get("type")?.as_str()?;

    let mut out = match proto_type {
        "vmess" => build_vmess(node, config_obj),
        "vless" => build_vless(node, config_obj),
        "trojan" => build_trojan(node, config_obj),
        "shadowsocks" => build_shadowsocks(node, config_obj),
        "hysteria2" => build_hysteria2(node, config_obj),
        "tuic" => build_tuic(node, config_obj),
        "anytls" => build_anytls(node, config_obj),
        _ => return None,
    }?;

    out["tag"] = json!(node.id);
    Some(out)
}

fn build_vmess(node: &ProxyNode, c: &serde_json::Map<String, Value>) -> Option<Value> {
    let mut out = json!({
        "type": "vmess",
        "server": node.server,
        "server_port": node.port,
        "uuid": c.get("uuid")?.as_str()?,
        "alter_id": c.get("alterId").and_then(|v| v.as_i64()).unwrap_or(0),
        "security": c.get("security").and_then(|v| v.as_str()).unwrap_or("auto"),
    });
    apply_transport(&mut out, c);
    apply_tls(&mut out, c);
    Some(out)
}

fn build_vless(node: &ProxyNode, c: &serde_json::Map<String, Value>) -> Option<Value> {
    let mut out = json!({
        "type": "vless",
        "server": node.server,
        "server_port": node.port,
        "uuid": c.get("uuid")?.as_str()?,
    });
    let flow = c.get("flow").and_then(|v| v.as_str()).unwrap_or("");
    if !flow.is_empty() {
        out["flow"] = json!(flow);
    }
    apply_transport(&mut out, c);
    apply_tls(&mut out, c);
    Some(out)
}

fn build_trojan(node: &ProxyNode, c: &serde_json::Map<String, Value>) -> Option<Value> {
    let mut out = json!({
        "type": "trojan",
        "server": node.server,
        "server_port": node.port,
        "password": c.get("password")?.as_str()?,
    });
    apply_transport(&mut out, c);
    apply_tls(&mut out, c);
    Some(out)
}

fn build_shadowsocks(node: &ProxyNode, c: &serde_json::Map<String, Value>) -> Option<Value> {
    let out = json!({
        "type": "shadowsocks",
        "server": node.server,
        "server_port": node.port,
        "password": c.get("password")?.as_str()?,
        "method": c.get("method")?.as_str()?,
    });
    Some(out)
}

fn build_hysteria2(node: &ProxyNode, c: &serde_json::Map<String, Value>) -> Option<Value> {
    let mut out = json!({
        "type": "hysteria2",
        "server": node.server,
        "server_port": node.port,
        "password": c.get("password")?.as_str()?,
    });
    let up = c.get("upMbps").and_then(|v| v.as_i64()).unwrap_or(0);
    let down = c.get("downMbps").and_then(|v| v.as_i64()).unwrap_or(0);
    if up > 0 {
        out["up_mbps"] = json!(up);
    }
    if down > 0 {
        out["down_mbps"] = json!(down);
    }
    let obfs_type = c.get("obfsType").and_then(|v| v.as_str()).unwrap_or("");
    if !obfs_type.is_empty() {
        out["obfs"] = json!({
            "type": obfs_type,
            "password": c.get("obfsPassword").and_then(|v| v.as_str()).unwrap_or("")
        });
    }
    apply_tls(&mut out, c);
    Some(out)
}

fn build_tuic(node: &ProxyNode, c: &serde_json::Map<String, Value>) -> Option<Value> {
    let mut out = json!({
        "type": "tuic",
        "server": node.server,
        "server_port": node.port,
        "uuid": c.get("uuid")?.as_str()?,
        "password": c.get("password")?.as_str()?,
        "congestion_control": c.get("congestionControl").and_then(|v| v.as_str()).unwrap_or("bbr"),
        "udp_relay_mode": c.get("udpRelayMode").and_then(|v| v.as_str()).unwrap_or("native"),
    });
    apply_tls(&mut out, c);
    Some(out)
}

fn build_anytls(node: &ProxyNode, c: &serde_json::Map<String, Value>) -> Option<Value> {
    let out = json!({
        "type": "anytls",
        "server": node.server,
        "server_port": node.port,
        "password": c.get("password")?.as_str()?,
        "tls": {
            "enabled": true,
            "server_name": c.get("sni").and_then(|v| v.as_str()).unwrap_or(""),
        },
        "idle_timeout": format!("{}s", c.get("idleTimeout").and_then(|v| v.as_i64()).unwrap_or(900)),
        "min_padding_len": c.get("minPaddingLen").and_then(|v| v.as_i64()).unwrap_or(0),
        "max_padding_len": c.get("maxPaddingLen").and_then(|v| v.as_i64()).unwrap_or(0),
    });
    Some(out)
}

fn apply_tls(out: &mut Value, c: &serde_json::Map<String, Value>) {
    let tls = match c.get("tls").and_then(|v| v.as_object()) {
        Some(t) => t,
        None => return,
    };
    let enabled = tls.get("enabled").and_then(|v| v.as_bool()).unwrap_or(false);
    if !enabled {
        return;
    }

    let mut tls_obj = json!({ "enabled": true });

    let sni = tls.get("sni").and_then(|v| v.as_str()).unwrap_or("");
    if !sni.is_empty() {
        tls_obj["server_name"] = json!(sni);
    }

    let alpn = tls.get("alpn").and_then(|v| v.as_array());
    if let Some(alpn) = alpn {
        if !alpn.is_empty() {
            tls_obj["alpn"] = json!(alpn);
        }
    }

    let insecure = tls.get("insecure").and_then(|v| v.as_bool()).unwrap_or(false);
    if insecure {
        tls_obj["insecure"] = json!(true);
    }

    let reality = tls.get("reality").and_then(|v| v.as_bool()).unwrap_or(false);
    if reality {
        let pub_key = tls.get("realityPublicKey").and_then(|v| v.as_str()).unwrap_or("");
        let short_id = tls.get("realityShortId").and_then(|v| v.as_str()).unwrap_or("");
        tls_obj["reality"] = json!({
            "enabled": true,
            "public_key": pub_key,
            "short_id": short_id,
        });
        tls_obj["utls"] = json!({
            "enabled": true,
            "fingerprint": "chrome",
        });
    }

    out["tls"] = tls_obj;
}

fn apply_transport(out: &mut Value, c: &serde_json::Map<String, Value>) {
    let transport = match c.get("transport").and_then(|v| v.as_object()) {
        Some(t) => t,
        None => return,
    };
    let t_type = transport.get("type").and_then(|v| v.as_str()).unwrap_or("tcp");
    if t_type == "tcp" {
        return;
    }

    let mut t_obj = json!({ "type": t_type });

    match t_type {
        "ws" => {
            let path = transport.get("wsPath").and_then(|v| v.as_str()).unwrap_or("/");
            t_obj["path"] = json!(path);
            if let Some(headers) = transport.get("wsHeaders").and_then(|v| v.as_object()) {
                if !headers.is_empty() {
                    t_obj["headers"] = json!(headers);
                }
            }
        }
        "grpc" => {
            let sn = transport.get("grpcServiceName").and_then(|v| v.as_str()).unwrap_or("");
            if !sn.is_empty() {
                t_obj["service_name"] = json!(sn);
            }
        }
        "h2" | "http" => {
            t_obj["type"] = json!("http");
            if let Some(hosts) = transport.get("h2Host").and_then(|v| v.as_array()) {
                if !hosts.is_empty() {
                    t_obj["host"] = json!(hosts);
                }
            }
        }
        _ => {}
    }

    out["transport"] = t_obj;
}

pub fn build_urltest_outbound(tag: &str, node_tags: &[String]) -> Value {
    json!({
        "type": "urltest",
        "tag": tag,
        "outbounds": node_tags,
        "url": "https://www.gstatic.com/generate_204",
        "tolerance": 50,
        "interrupt_exist_connections": false,
    })
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cargo check --manifest-path src-tauri/Cargo.toml 2>&1 | tail -5`

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/singbox/outbounds.rs
git commit -m "feat: implement outbound config generation for all protocols"
```

---

### Task 3: Integrate Outbounds into Config Generation

**Files:**
- Modify: `src-tauri/src/singbox/config.rs`

- [ ] **Step 1: Update `generate_config` to include node outbounds**

In `src-tauri/src/singbox/config.rs`, add the import at the top:

```rust
use super::nodes_storage;
use super::outbounds;
```

Then replace the hardcoded outbounds array and route section in `generate_config`:

```rust
    // Build outbounds from nodes
    let nodes_data = nodes_storage::load_nodes();
    let mut outbound_list: Vec<Value> = Vec::new();
    let mut all_node_tags: Vec<String> = Vec::new();

    for group in &nodes_data.groups {
        for node in &group.nodes {
            if let Some(ob) = outbounds::build_outbound(node) {
                all_node_tags.push(node.id.clone());
                outbound_list.push(ob);
            }
        }
    }

    // Generate urltest outbounds for urltest groups
    for group in &nodes_data.groups {
        if group.group_type == "urltest" {
            let tags: Vec<String> = group.nodes.iter()
                .map(|n| n.id.clone())
                .filter(|id| all_node_tags.contains(id))
                .collect();
            if !tags.is_empty() {
                outbound_list.push(outbounds::build_urltest_outbound(&group.id, &tags));
            }
        }
    }

    // Always include direct-out and block-out
    outbound_list.push(json!({ "type": "direct", "tag": "direct-out" }));
    outbound_list.push(json!({ "type": "block", "tag": "block-out" }));

    // Route final: active node or direct-out
    let route_final = nodes_data.active_node
        .as_ref()
        .filter(|id| all_node_tags.contains(id))
        .cloned()
        .unwrap_or_else(|| "direct-out".to_string());
```

And update the json! block to use `outbound_list` and `route_final`:

```rust
    json!({
        "log": {
            "level": settings.log_level,
            "timestamp": true
        },
        "dns": dns_section,
        "inbounds": inbounds,
        "outbounds": outbound_list,
        "route": {
            "auto_detect_interface": true,
            "final": route_final,
            "default_domain_resolver": {
                "server": default_resolver
            }
        },
        "experimental": {
            "clash_api": {
                "external_controller": "127.0.0.1:9091",
                "default_mode": "Rule"
            }
        }
    })
```

- [ ] **Step 2: Verify it compiles**

Run: `cargo check --manifest-path src-tauri/Cargo.toml 2>&1 | tail -5`

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/singbox/config.rs
git commit -m "feat: include node outbounds in sing-box config generation"
```

---

### Task 4: Add Latency Test to Clash API

**Files:**
- Modify: `src-tauri/src/singbox/clash_api.rs`

- [ ] **Step 1: Add `test_delay` method**

Add to the `impl ClashApi` block in `src-tauri/src/singbox/clash_api.rs`:

```rust
    pub async fn test_delay(&self, proxy_name: &str, timeout: u64) -> Result<u64, String> {
        let url = format!(
            "{}/proxies/{}/delay?url={}&timeout={}",
            BASE_URL,
            urlencoding::encode(proxy_name),
            urlencoding::encode("https://www.gstatic.com/generate_204"),
            timeout
        );
        let resp = self.client.get(&url).send().await.map_err(|e| e.to_string())?;
        if !resp.status().is_success() {
            return Err(format!("delay test failed: {}", resp.status()));
        }
        let body: Value = resp.json().await.map_err(|e| e.to_string())?;
        body.get("delay")
            .and_then(|v| v.as_u64())
            .ok_or_else(|| "no delay in response".to_string())
    }
```

- [ ] **Step 2: Add `urlencoding` and `serde_json` to Cargo.toml if needed**

Check `src-tauri/Cargo.toml` for `urlencoding`. If missing, add:

```toml
urlencoding = "2"
```

Also add `use serde_json::Value;` at the top of clash_api.rs.

- [ ] **Step 3: Verify it compiles**

Run: `cargo check --manifest-path src-tauri/Cargo.toml 2>&1 | tail -5`

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/singbox/clash_api.rs src-tauri/Cargo.toml
git commit -m "feat: add delay test method to Clash API client"
```

---

### Task 5: Tauri Node Commands

**Files:**
- Create: `src-tauri/src/commands/nodes.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Create `commands/nodes.rs`**

```rust
// src-tauri/src/commands/nodes.rs
use std::sync::Arc;
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager};

use crate::singbox::nodes_storage::{self, NodesData, NodeGroup, ProxyNode};
use crate::singbox::process::SingboxProcess;
use crate::singbox::storage;

#[tauri::command]
pub async fn get_nodes() -> Result<NodesData, String> {
    Ok(nodes_storage::load_nodes())
}

#[tauri::command]
pub async fn add_node(
    app: AppHandle,
    group_id: String,
    node: ProxyNode,
) -> Result<NodesData, String> {
    let mut data = nodes_storage::load_nodes();
    let group = data.groups.iter_mut()
        .find(|g| g.id == group_id)
        .ok_or_else(|| format!("group {} not found", group_id))?;
    group.nodes.push(node);
    nodes_storage::save_nodes(&data)?;
    restart_singbox(&app).await;
    Ok(data)
}

#[tauri::command]
pub async fn remove_node(
    app: AppHandle,
    node_id: String,
) -> Result<NodesData, String> {
    let mut data = nodes_storage::load_nodes();
    for group in &mut data.groups {
        group.nodes.retain(|n| n.id != node_id);
    }
    if data.active_node.as_deref() == Some(&node_id) {
        data.active_node = None;
    }
    nodes_storage::save_nodes(&data)?;
    restart_singbox(&app).await;
    Ok(data)
}

#[tauri::command]
pub async fn add_group(
    app: AppHandle,
    name: String,
    group_type: Option<String>,
) -> Result<NodesData, String> {
    let mut data = nodes_storage::load_nodes();
    let id = format!("group-{}", chrono::Utc::now().timestamp_millis());
    data.groups.push(NodeGroup {
        id,
        name,
        group_type: group_type.unwrap_or_else(|| "select".to_string()),
        nodes: vec![],
    });
    nodes_storage::save_nodes(&data)?;
    restart_singbox(&app).await;
    Ok(data)
}

#[tauri::command]
pub async fn remove_group(
    app: AppHandle,
    group_id: String,
) -> Result<NodesData, String> {
    let mut data = nodes_storage::load_nodes();
    data.groups.retain(|g| g.id != group_id);
    nodes_storage::save_nodes(&data)?;
    restart_singbox(&app).await;
    Ok(data)
}

#[tauri::command]
pub async fn rename_group(
    app: AppHandle,
    group_id: String,
    name: String,
) -> Result<NodesData, String> {
    let mut data = nodes_storage::load_nodes();
    if let Some(g) = data.groups.iter_mut().find(|g| g.id == group_id) {
        g.name = name;
    }
    nodes_storage::save_nodes(&data)?;
    Ok(data)
}

#[tauri::command]
pub async fn set_active_node(
    app: AppHandle,
    node_id: String,
) -> Result<NodesData, String> {
    let mut data = nodes_storage::load_nodes();
    data.active_node = Some(node_id);
    nodes_storage::save_nodes(&data)?;
    restart_singbox(&app).await;
    Ok(data)
}

#[tauri::command]
pub async fn test_node_latency(
    app: AppHandle,
    node_id: String,
) -> Result<u64, String> {
    let process = app.state::<Arc<SingboxProcess>>().inner().clone();
    process.api().test_delay(&node_id, 5000).await
}

#[tauri::command]
pub async fn test_group_latency(
    app: AppHandle,
    group_id: String,
) -> Result<Vec<(String, Result<u64, String>)>, String> {
    let data = nodes_storage::load_nodes();
    let group = data.groups.iter()
        .find(|g| g.id == group_id)
        .ok_or_else(|| format!("group {} not found", group_id))?;

    let process = app.state::<Arc<SingboxProcess>>().inner().clone();
    let mut results = Vec::new();

    for node in &group.nodes {
        let result = process.api().test_delay(&node.id, 5000).await;
        results.push((node.id.clone(), result));
    }

    Ok(results)
}

async fn restart_singbox(app: &AppHandle) {
    let process = app.state::<Arc<SingboxProcess>>().inner().clone();
    let settings = storage::load_settings();
    let _ = process.restart(&settings).await;
    let _ = app.emit("singbox-restarted", ());
}
```

- [ ] **Step 2: Add `chrono` dependency if needed**

Actually, avoid adding chrono. Use a simpler ID generation:

Replace the `add_group` ID line with:
```rust
    let id = format!("group-{}", std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis());
```

- [ ] **Step 3: Add module to `commands/mod.rs`**

```rust
pub mod logs;
pub mod connection;
pub mod settings;
pub mod dns;
pub mod nodes;
```

- [ ] **Step 4: Register commands in `lib.rs`**

Add to the `invoke_handler` in `src-tauri/src/lib.rs`:

```rust
            commands::nodes::get_nodes,
            commands::nodes::add_node,
            commands::nodes::remove_node,
            commands::nodes::add_group,
            commands::nodes::remove_group,
            commands::nodes::rename_group,
            commands::nodes::set_active_node,
            commands::nodes::test_node_latency,
            commands::nodes::test_group_latency,
```

- [ ] **Step 5: Verify it compiles**

Run: `cargo check --manifest-path src-tauri/Cargo.toml 2>&1 | tail -5`

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/commands/nodes.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs
git commit -m "feat: add Tauri commands for node CRUD and latency testing"
```

---

### Task 6: Frontend Service Integration

**Files:**
- Modify: `src/services/nodes.ts`

- [ ] **Step 1: Add Tauri implementation to nodes service**

Add after the mock service and before the export in `src/services/nodes.ts`:

```typescript
// ---- Tauri Implementation ----

interface RawNodesData {
  groups: Array<{
    id: string;
    name: string;
    groupType: string;
    nodes: Array<{
      id: string;
      name: string;
      server: string;
      port: number;
      protocol: string;
      country: string;
      countryCode: string;
      protocolConfig?: ProtocolConfig;
    }>;
  }>;
  activeNode: string | null;
}

function toNodeGroups(raw: RawNodesData): NodeGroup[] {
  return raw.groups.map((g) => ({
    id: g.id,
    name: g.name,
    nodes: g.nodes.map((n) => ({
      ...n,
      latency: null,
      active: raw.activeNode === n.id,
    })),
  }));
}

function createTauriNodesService(): NodesService {
  return {
    async getGroups() {
      const { invoke } = await import("@tauri-apps/api/core");
      const raw = await invoke<RawNodesData>("get_nodes");
      return toNodeGroups(raw);
    },
    async testLatency(nodeId) {
      const { invoke } = await import("@tauri-apps/api/core");
      return invoke<number>("test_node_latency", { nodeId });
    },
    async testAllLatency(groupId) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("test_group_latency", { groupId });
    },
    async setActiveNode(nodeId) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("set_active_node", { nodeId });
    },
    async addNode(groupId, input) {
      const { invoke } = await import("@tauri-apps/api/core");
      const node = {
        id: `node-${Date.now()}`,
        name: input.name,
        server: input.server,
        port: input.port,
        protocol: input.protocol,
        country: input.country,
        countryCode: input.countryCode,
        protocolConfig: input.protocolConfig ?? null,
      };
      const raw = await invoke<RawNodesData>("add_node", { groupId, node });
      const groups = toNodeGroups(raw);
      const group = groups.find((g) => g.id === groupId);
      return group?.nodes[group.nodes.length - 1] ?? { ...input, id: node.id, latency: null, active: false };
    },
    async removeNode(nodeId) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("remove_node", { nodeId });
    },
    async addGroup(name) {
      const { invoke } = await import("@tauri-apps/api/core");
      const raw = await invoke<RawNodesData>("add_group", { name });
      const groups = toNodeGroups(raw);
      return groups[groups.length - 1];
    },
    async removeGroup(groupId) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("remove_group", { groupId });
    },
    async renameGroup(groupId, name) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("rename_group", { groupId, name });
    },
  };
}
```

- [ ] **Step 2: Update the export to switch on isTauri**

Replace the last line of `src/services/nodes.ts`:

```typescript
// ---- Export ----

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
export const nodesService: NodesService = isTauri ? createTauriNodesService() : {
  // Keep existing mock as-is
  async getGroups() { return cloneNodes(); },
  async testLatency(nodeId: string) {
    const latency = Math.floor(Math.random() * 200) + 20;
    const node = findNode(nodeId);
    if (node) node.latency = latency;
    return latency;
  },
  async testAllLatency() {
    for (const group of mockNodes) {
      for (const node of group.nodes) {
        node.latency = Math.floor(Math.random() * 200) + 20;
      }
    }
  },
  async setActiveNode(nodeId: string) {
    for (const group of mockNodes) {
      for (const node of group.nodes) {
        node.active = node.id === nodeId;
      }
    }
  },
  async addNode(groupId: string, input: NewNodeInput) {
    const group = mockNodes.find((g) => g.id === groupId);
    if (!group) throw new Error(`Group ${groupId} not found`);
    const newNode: ProxyNode = {
      id: `custom-${Date.now()}`,
      ...input,
      latency: null,
      active: false,
    };
    group.nodes.push(newNode);
    return { ...newNode };
  },
  async removeNode(nodeId: string) {
    for (const group of mockNodes) {
      const idx = group.nodes.findIndex((n) => n.id === nodeId);
      if (idx !== -1) { group.nodes.splice(idx, 1); return; }
    }
  },
  async addGroup(name: string) {
    const group: NodeGroup = { id: `group-${Date.now()}`, name, nodes: [] };
    mockNodes.push(group);
    return { ...group };
  },
  async removeGroup(groupId: string) {
    const idx = mockNodes.findIndex((g) => g.id === groupId);
    if (idx !== -1) mockNodes.splice(idx, 1);
  },
  async renameGroup(groupId: string, name: string) {
    const group = mockNodes.find((g) => g.id === groupId);
    if (group) group.name = name;
  },
};
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 4: Run all tests**

Run: `npx vitest run 2>&1 | tail -10`
Expected: all tests pass (mock service unchanged)

- [ ] **Step 5: Commit**

```bash
git add src/services/nodes.ts
git commit -m "feat: add Tauri nodes service with mock fallback"
```

---

### Task 7: Final Verification

- [ ] **Step 1: Verify Rust compiles clean**

Run: `cargo check --manifest-path src-tauri/Cargo.toml 2>&1 | tail -5`

- [ ] **Step 2: Verify TypeScript compiles clean**

Run: `npx tsc --noEmit 2>&1`

- [ ] **Step 3: Run all frontend tests**

Run: `npx vitest run 2>&1 | tail -10`

- [ ] **Step 4: Verify nodes.json defaults**

The first time the app runs with no `nodes.json`, `load_nodes()` returns a default with one empty "Proxy" group. Adding a node via the UI will persist to `nodes.json`, regenerate the sing-box config with the new outbound, and restart sing-box.
