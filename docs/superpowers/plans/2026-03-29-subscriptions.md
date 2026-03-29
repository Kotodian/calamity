# Subscriptions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace mock subscription service with real v2ray subscription fetching, parsing, node importing, and auto-update via Tauri backend.

**Architecture:** Backend (Rust) handles HTTP fetching, base64 decoding, v2ray URI parsing, subscription persistence, and auto-update timers. Frontend service layer switches from mock to Tauri invoke calls. Subscriptions create dedicated node groups with full replacement on update. Response header `subscription-userinfo` is parsed for traffic/expiry data.

**Tech Stack:** Rust/Tauri (backend), reqwest (HTTP), base64 (decoding), TypeScript/React/Zustand (frontend)

---

## File Structure

| File | Responsibility |
|------|---------------|
| **Create:** `src-tauri/src/singbox/subscriptions_storage.rs` | `SubscriptionConfig` struct, load/save to `subscriptions.json` |
| **Create:** `src-tauri/src/singbox/subscription_fetch.rs` | HTTP fetch, base64 decode, v2ray URI parse, userinfo header parse |
| **Create:** `src-tauri/src/commands/subscriptions.rs` | Tauri commands: add, update, delete, toggle, edit, get, update_all |
| **Modify:** `src-tauri/src/singbox/mod.rs` | Add new modules |
| **Modify:** `src-tauri/src/commands/mod.rs` | Add `pub mod subscriptions` |
| **Modify:** `src-tauri/src/lib.rs` | Register new commands |
| **Modify:** `src/services/subscriptions.ts` | Replace mock with Tauri implementation, update types |
| **Modify:** `src/stores/subscriptions.ts` | Adapt store to new service interface |
| **Modify:** `src/pages/SubscriptionsPage.tsx` | Custom interval input, expire display, loading states |

---

### Task 1: Subscription Storage (Rust)

**Files:**
- Create: `src-tauri/src/singbox/subscriptions_storage.rs`
- Modify: `src-tauri/src/singbox/mod.rs`

- [ ] **Step 1: Create subscriptions_storage.rs with data structures**

```rust
// src-tauri/src/singbox/subscriptions_storage.rs
use serde::{Deserialize, Serialize};
use super::storage::{read_json, write_json};

const SUBSCRIPTIONS_FILE: &str = "subscriptions.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubscriptionConfig {
    pub id: String,
    pub name: String,
    pub url: String,
    pub enabled: bool,
    pub auto_update_interval: u64, // seconds, 0 = never
    pub last_updated: Option<String>,
    pub node_count: u32,
    pub group_id: String, // corresponding node group id
    // From subscription-userinfo header
    pub traffic_upload: u64,
    pub traffic_download: u64,
    pub traffic_total: u64,
    pub expire: Option<String>, // ISO date string
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SubscriptionsData {
    pub subscriptions: Vec<SubscriptionConfig>,
}

pub fn load_subscriptions() -> SubscriptionsData {
    read_json(SUBSCRIPTIONS_FILE)
}

pub fn save_subscriptions(data: &SubscriptionsData) -> Result<(), String> {
    write_json(SUBSCRIPTIONS_FILE, data)
}
```

- [ ] **Step 2: Add module to singbox/mod.rs**

Add `pub mod subscriptions_storage;` to `src-tauri/src/singbox/mod.rs`.

- [ ] **Step 3: Verify it compiles**

Run: `cd /Users/linqiankai/calamity && cargo check -p calamity`
Expected: compiles with no errors

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/singbox/subscriptions_storage.rs src-tauri/src/singbox/mod.rs
git commit -m "feat: add subscription storage data structures"
```

---

### Task 2: Subscription Fetcher (Rust)

**Files:**
- Create: `src-tauri/src/singbox/subscription_fetch.rs`
- Modify: `src-tauri/src/singbox/mod.rs`

- [ ] **Step 1: Create subscription_fetch.rs**

This module fetches a subscription URL, decodes the base64 response body, parses each line as a v2ray URI, and extracts `subscription-userinfo` from the response headers.

```rust
// src-tauri/src/singbox/subscription_fetch.rs
use base64::Engine;
use serde_json::Value;

use super::nodes_storage::ProxyNode;

#[derive(Debug, Clone)]
pub struct SubscriptionUserInfo {
    pub upload: u64,
    pub download: u64,
    pub total: u64,
    pub expire: Option<String>, // ISO date string
}

#[derive(Debug, Clone)]
pub struct FetchResult {
    pub nodes: Vec<ProxyNode>,
    pub user_info: Option<SubscriptionUserInfo>,
}

/// Parse `subscription-userinfo` header value.
/// Format: `upload=123; download=456; total=789; expire=1234567890`
fn parse_userinfo(header_value: &str) -> SubscriptionUserInfo {
    let mut upload = 0u64;
    let mut download = 0u64;
    let mut total = 0u64;
    let mut expire: Option<String> = None;

    for part in header_value.split(';') {
        let part = part.trim();
        if let Some((key, val)) = part.split_once('=') {
            let key = key.trim();
            let val = val.trim();
            match key {
                "upload" => upload = val.parse().unwrap_or(0),
                "download" => download = val.parse().unwrap_or(0),
                "total" => total = val.parse().unwrap_or(0),
                "expire" => {
                    if let Ok(ts) = val.parse::<i64>() {
                        if ts > 0 {
                            // Convert unix timestamp to ISO string
                            let dt = chrono::DateTime::from_timestamp(ts, 0);
                            expire = dt.map(|d| d.to_rfc3339());
                        }
                    }
                }
                _ => {}
            }
        }
    }

    SubscriptionUserInfo { upload, download, total, expire }
}

/// Parse a single v2ray URI line into a ProxyNode.
/// Returns None if the line is not a recognized URI.
fn parse_v2ray_uri(uri: &str) -> Option<ProxyNode> {
    let uri = uri.trim();
    if uri.is_empty() {
        return None;
    }

    if uri.starts_with("vmess://") {
        parse_vmess(uri)
    } else if uri.starts_with("vless://") {
        parse_vless(uri)
    } else if uri.starts_with("trojan://") {
        parse_trojan(uri)
    } else if uri.starts_with("ss://") {
        parse_ss(uri)
    } else if uri.starts_with("hy2://") || uri.starts_with("hysteria2://") {
        parse_hy2(uri)
    } else if uri.starts_with("tuic://") {
        parse_tuic(uri)
    } else {
        None
    }
}

fn parse_standard_uri(uri: &str) -> Option<(String, String, u16, std::collections::HashMap<String, String>, String)> {
    // Returns (userinfo, host, port, params, fragment)
    let hash_idx = uri.find('#');
    let fragment = hash_idx.map(|i| urlencoding::decode(&uri[i+1..]).unwrap_or_default().to_string()).unwrap_or_default();
    let without_fragment = hash_idx.map(|i| &uri[..i]).unwrap_or(uri);

    let scheme_end = without_fragment.find("://")?;
    let rest = &without_fragment[scheme_end + 3..];

    let at_idx = rest.find('@');
    let userinfo = at_idx.map(|i| rest[..i].to_string()).unwrap_or_default();
    let host_part = at_idx.map(|i| &rest[i+1..]).unwrap_or(rest);

    let q_idx = host_part.find('?');
    let host_port = q_idx.map(|i| &host_part[..i]).unwrap_or(host_part);
    let query_str = q_idx.map(|i| &host_part[i+1..]).unwrap_or("");

    let last_colon = host_port.rfind(':')?;
    let host = host_port[..last_colon].to_string();
    let port: u16 = host_port[last_colon+1..].parse().unwrap_or(443);

    let mut params = std::collections::HashMap::new();
    for pair in query_str.split('&') {
        if let Some((k, v)) = pair.split_once('=') {
            params.insert(k.to_string(), urlencoding::decode(v).unwrap_or_default().to_string());
        }
    }

    Some((userinfo, host, port, params, fragment))
}

fn make_tls_config(params: &std::collections::HashMap<String, String>, default_sni: &str) -> Value {
    let security = params.get("security").map(|s| s.as_str()).unwrap_or("");
    let is_reality = security == "reality";
    let enabled = security != "none" && security != "";

    serde_json::json!({
        "enabled": enabled || is_reality,
        "sni": params.get("sni").unwrap_or(&default_sni.to_string()),
        "alpn": params.get("alpn").map(|a| a.split(',').collect::<Vec<_>>()).unwrap_or_default(),
        "insecure": params.get("allowInsecure").map(|v| v == "1").unwrap_or(false),
        "reality": is_reality,
        "realityPublicKey": params.get("pbk").unwrap_or(&String::new()),
        "realityShortId": params.get("sid").unwrap_or(&String::new()),
    })
}

fn make_transport_config(params: &std::collections::HashMap<String, String>) -> Value {
    let transport_type = params.get("type").map(|s| s.as_str()).unwrap_or("tcp");
    serde_json::json!({
        "type": transport_type
    })
}

fn infer_country(name: &str) -> (String, String) {
    let patterns: &[(&[&str], &str, &str)] = &[
        (&["HK", "Hong Kong", "香港", "🇭🇰"], "Hong Kong", "HK"),
        (&["JP", "Japan", "日本", "东京", "Tokyo", "Osaka", "大阪", "🇯🇵"], "Japan", "JP"),
        (&["US", "USA", "United States", "美国", "Los Angeles", "San Jose", "Seattle", "🇺🇸"], "United States", "US"),
        (&["SG", "Singapore", "新加坡", "🇸🇬"], "Singapore", "SG"),
        (&["KR", "Korea", "韩国", "首尔", "Seoul", "🇰🇷"], "South Korea", "KR"),
        (&["TW", "Taiwan", "台湾", "🇹🇼"], "Taiwan", "TW"),
        (&["DE", "Germany", "德国", "🇩🇪"], "Germany", "DE"),
        (&["GB", "UK", "United Kingdom", "英国", "London", "🇬🇧"], "United Kingdom", "GB"),
        (&["FR", "France", "法国", "🇫🇷"], "France", "FR"),
        (&["AU", "Australia", "澳大利亚", "🇦🇺"], "Australia", "AU"),
        (&["CA", "Canada", "加拿大", "🇨🇦"], "Canada", "CA"),
        (&["IN", "India", "印度", "🇮🇳"], "India", "IN"),
        (&["RU", "Russia", "俄罗斯", "🇷🇺"], "Russia", "RU"),
        (&["NL", "Netherlands", "荷兰", "🇳🇱"], "Netherlands", "NL"),
        (&["TR", "Turkey", "土耳其", "🇹🇷"], "Turkey", "TR"),
    ];
    let upper = name.to_uppercase();
    for (keywords, country, code) in patterns {
        for kw in *keywords {
            if upper.contains(&kw.to_uppercase()) {
                return (country.to_string(), code.to_string());
            }
        }
    }
    (String::new(), String::new())
}

fn parse_vmess(uri: &str) -> Option<ProxyNode> {
    let b64 = &uri[8..];
    let decoded = base64::engine::general_purpose::STANDARD.decode(b64)
        .or_else(|_| base64::engine::general_purpose::STANDARD_NO_PAD.decode(b64))
        .ok()?;
    let json: Value = serde_json::from_slice(&decoded).ok()?;

    let name = json["ps"].as_str().unwrap_or("VMess Node").to_string();
    let server = json["add"].as_str()?.to_string();
    let port = json["port"].as_str().and_then(|p| p.parse().ok())
        .or_else(|| json["port"].as_u64().map(|p| p as u16))
        .unwrap_or(443);
    let (country, country_code) = infer_country(&name);

    let config = serde_json::json!({
        "type": "vmess",
        "uuid": json["id"].as_str().unwrap_or(""),
        "alterId": json["aid"].as_str().and_then(|a| a.parse::<u64>().ok()).unwrap_or(0),
        "security": "auto",
        "transport": { "type": json["net"].as_str().unwrap_or("tcp") },
        "tls": {
            "enabled": json["tls"].as_str() == Some("tls"),
            "sni": json["sni"].as_str().or(json["host"].as_str()).unwrap_or(""),
            "alpn": [],
            "insecure": false,
            "reality": false,
            "realityPublicKey": "",
            "realityShortId": "",
        }
    });

    Some(ProxyNode {
        id: name.clone(),
        name: name.clone(),
        server,
        port,
        protocol: "VMess".to_string(),
        country,
        country_code,
        protocol_config: Some(config),
    })
}

fn parse_vless(uri: &str) -> Option<ProxyNode> {
    let (uuid, host, port, params, fragment) = parse_standard_uri(uri)?;
    let name = if fragment.is_empty() { "VLESS Node".to_string() } else { fragment };
    let (country, country_code) = infer_country(&name);

    let config = serde_json::json!({
        "type": "vless",
        "uuid": uuid,
        "flow": params.get("flow").unwrap_or(&String::new()),
        "transport": make_transport_config(&params),
        "tls": make_tls_config(&params, &host),
    });

    Some(ProxyNode {
        id: name.clone(),
        name: name.clone(),
        server: host,
        port,
        protocol: "VLESS".to_string(),
        country,
        country_code,
        protocol_config: Some(config),
    })
}

fn parse_trojan(uri: &str) -> Option<ProxyNode> {
    let (password, host, port, params, fragment) = parse_standard_uri(uri)?;
    let name = if fragment.is_empty() { "Trojan Node".to_string() } else { fragment };
    let (country, country_code) = infer_country(&name);
    let password = urlencoding::decode(&password).unwrap_or_default().to_string();

    let config = serde_json::json!({
        "type": "trojan",
        "password": password,
        "transport": make_transport_config(&params),
        "tls": {
            "enabled": true,
            "sni": params.get("sni").unwrap_or(&host),
            "alpn": params.get("alpn").map(|a| a.split(',').collect::<Vec<_>>()).unwrap_or_default(),
            "insecure": params.get("allowInsecure").map(|v| v == "1").unwrap_or(false),
            "reality": false,
            "realityPublicKey": "",
            "realityShortId": "",
        }
    });

    Some(ProxyNode {
        id: name.clone(),
        name: name.clone(),
        server: host,
        port,
        protocol: "Trojan".to_string(),
        country,
        country_code,
        protocol_config: Some(config),
    })
}

fn parse_ss(uri: &str) -> Option<ProxyNode> {
    let hash_idx = uri.find('#');
    let fragment = hash_idx.map(|i| urlencoding::decode(&uri[i+1..]).unwrap_or_default().to_string()).unwrap_or_default();
    let without_fragment = hash_idx.map(|i| &uri[..i]).unwrap_or(uri);
    let content = &without_fragment[5..]; // remove "ss://"

    let (method, password, server, port);

    if content.contains('@') {
        // SIP002: BASE64(method:password)@host:port
        let at_idx = content.find('@')?;
        let user_part = &content[..at_idx];
        let host_part = &content[at_idx+1..];

        let decoded = base64::engine::general_purpose::STANDARD.decode(user_part)
            .or_else(|_| base64::engine::general_purpose::STANDARD_NO_PAD.decode(user_part))
            .ok()
            .and_then(|b| String::from_utf8(b).ok())
            .unwrap_or_else(|| urlencoding::decode(user_part).unwrap_or_default().to_string());

        let colon_idx = decoded.find(':')?;
        method = decoded[..colon_idx].to_string();
        password = decoded[colon_idx+1..].to_string();

        let last_colon = host_part.rfind(':')?;
        server = host_part[..last_colon].to_string();
        port = host_part[last_colon+1..].parse().unwrap_or(443);
    } else {
        // Legacy: BASE64(method:password@host:port)
        let decoded = base64::engine::general_purpose::STANDARD.decode(content)
            .or_else(|_| base64::engine::general_purpose::STANDARD_NO_PAD.decode(content))
            .ok()
            .and_then(|b| String::from_utf8(b).ok())
            .unwrap_or_else(|| content.to_string());

        let at_idx = decoded.find('@')?;
        let user_part = &decoded[..at_idx];
        let host_part = &decoded[at_idx+1..];

        let colon_idx = user_part.find(':')?;
        method = user_part[..colon_idx].to_string();
        password = user_part[colon_idx+1..].to_string();

        let last_colon = host_part.rfind(':')?;
        server = host_part[..last_colon].to_string();
        port = host_part[last_colon+1..].parse().unwrap_or(443);
    }

    let name = if fragment.is_empty() { "SS Node".to_string() } else { fragment };
    let (country, country_code) = infer_country(&name);

    let config = serde_json::json!({
        "type": "shadowsocks",
        "password": password,
        "method": method,
    });

    Some(ProxyNode {
        id: name.clone(),
        name: name.clone(),
        server,
        port,
        protocol: "Shadowsocks".to_string(),
        country,
        country_code,
        protocol_config: Some(config),
    })
}

fn parse_hy2(uri: &str) -> Option<ProxyNode> {
    let (password, host, port, params, fragment) = parse_standard_uri(uri)?;
    let name = if fragment.is_empty() { "Hysteria2 Node".to_string() } else { fragment };
    let (country, country_code) = infer_country(&name);
    let password = urlencoding::decode(&password).unwrap_or_default().to_string();

    let config = serde_json::json!({
        "type": "hysteria2",
        "password": password,
        "upMbps": params.get("up").and_then(|v| v.parse::<u64>().ok()).unwrap_or(100),
        "downMbps": params.get("down").and_then(|v| v.parse::<u64>().ok()).unwrap_or(200),
        "obfsType": params.get("obfs").unwrap_or(&String::new()),
        "obfsPassword": params.get("obfs-password").unwrap_or(&String::new()),
        "tls": {
            "enabled": true,
            "sni": params.get("sni").unwrap_or(&host),
            "alpn": [],
            "insecure": params.get("insecure").map(|v| v == "1").unwrap_or(false),
            "reality": false,
            "realityPublicKey": "",
            "realityShortId": "",
        }
    });

    Some(ProxyNode {
        id: name.clone(),
        name: name.clone(),
        server: host,
        port,
        protocol: "Hysteria2".to_string(),
        country,
        country_code,
        protocol_config: Some(config),
    })
}

fn parse_tuic(uri: &str) -> Option<ProxyNode> {
    let (userinfo, host, port, params, fragment) = parse_standard_uri(uri)?;
    let mut parts = userinfo.splitn(2, ':');
    let uuid = parts.next().unwrap_or("").to_string();
    let password = parts.next().unwrap_or("").to_string();
    let name = if fragment.is_empty() { "TUIC Node".to_string() } else { fragment };
    let (country, country_code) = infer_country(&name);

    let config = serde_json::json!({
        "type": "tuic",
        "uuid": uuid,
        "password": password,
        "congestionControl": params.get("congestion_control").unwrap_or(&"bbr".to_string()),
        "udpRelayMode": params.get("udp_relay_mode").unwrap_or(&"native".to_string()),
        "tls": {
            "enabled": true,
            "sni": params.get("sni").unwrap_or(&host),
            "alpn": params.get("alpn").map(|a| a.split(',').collect::<Vec<_>>()).unwrap_or_default(),
            "insecure": params.get("allowInsecure").map(|v| v == "1").unwrap_or(false),
            "reality": false,
            "realityPublicKey": "",
            "realityShortId": "",
        }
    });

    Some(ProxyNode {
        id: name.clone(),
        name: name.clone(),
        server: host,
        port,
        protocol: "TUIC".to_string(),
        country,
        country_code,
        protocol_config: Some(config),
    })
}

/// Fetch a v2ray subscription URL and return parsed nodes + user info.
pub async fn fetch_subscription(url: &str) -> Result<FetchResult, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .danger_accept_invalid_certs(true)
        .build()
        .map_err(|e| format!("failed to create HTTP client: {}", e))?;

    let response = client.get(url).send().await
        .map_err(|e| format!("failed to fetch subscription: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("subscription returned HTTP {}", response.status()));
    }

    // Parse subscription-userinfo header
    let user_info = response.headers()
        .get("subscription-userinfo")
        .and_then(|v| v.to_str().ok())
        .map(|v| parse_userinfo(v));

    let body = response.text().await
        .map_err(|e| format!("failed to read response body: {}", e))?;

    // Try base64 decode first, fall back to raw text
    let decoded = base64::engine::general_purpose::STANDARD.decode(body.trim())
        .or_else(|_| base64::engine::general_purpose::STANDARD_NO_PAD.decode(body.trim()))
        .and_then(|b| String::from_utf8(b).map_err(|e| base64::DecodeError::InvalidByte(0, 0)))
        .unwrap_or_else(|_| body.clone());

    let nodes: Vec<ProxyNode> = decoded
        .lines()
        .filter_map(|line| parse_v2ray_uri(line))
        .collect();

    Ok(FetchResult { nodes, user_info })
}
```

- [ ] **Step 2: Add dependencies to Cargo.toml**

Check if `reqwest`, `base64`, `chrono`, and `urlencoding` are already in `src-tauri/Cargo.toml`. Add any missing ones:

```toml
reqwest = { version = "0.12", features = ["json"] }
base64 = "0.22"
chrono = "0.4"
urlencoding = "2"
```

- [ ] **Step 3: Add module to singbox/mod.rs**

Add `pub mod subscription_fetch;` to `src-tauri/src/singbox/mod.rs`.

- [ ] **Step 4: Verify it compiles**

Run: `cd /Users/linqiankai/calamity && cargo check -p calamity`
Expected: compiles with no errors (may have unused warnings, that's fine)

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/singbox/subscription_fetch.rs src-tauri/src/singbox/mod.rs src-tauri/Cargo.toml
git commit -m "feat: add subscription fetcher with v2ray URI parsing"
```

---

### Task 3: Subscription Commands (Rust)

**Files:**
- Create: `src-tauri/src/commands/subscriptions.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Create commands/subscriptions.rs**

```rust
// src-tauri/src/commands/subscriptions.rs
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};

use crate::singbox::nodes_storage::{self, NodeGroup, NodesData};
use crate::singbox::process::SingboxProcess;
use crate::singbox::storage;
use crate::singbox::subscriptions_storage::{self, SubscriptionConfig, SubscriptionsData};
use crate::singbox::subscription_fetch;

#[tauri::command]
pub async fn get_subscriptions() -> Result<SubscriptionsData, String> {
    Ok(subscriptions_storage::load_subscriptions())
}

#[tauri::command]
pub async fn add_subscription(
    app: AppHandle,
    name: String,
    url: String,
    auto_update_interval: Option<u64>,
) -> Result<SubscriptionConfig, String> {
    let mut subs_data = subscriptions_storage::load_subscriptions();
    let mut nodes_data = nodes_storage::load_nodes();

    // Create a group for this subscription
    let group_id = format!(
        "sub-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis()
    );

    let sub_id = format!("sub-{}", uuid::Uuid::new_v4());

    // Fetch subscription
    let result = subscription_fetch::fetch_subscription(&url).await?;

    // Create node group with fetched nodes
    let node_count = result.nodes.len() as u32;
    nodes_data.groups.push(NodeGroup {
        id: group_id.clone(),
        name: name.clone(),
        group_type: "select".to_string(),
        nodes: result.nodes,
    });
    nodes_storage::save_nodes(&nodes_data)?;

    // Create subscription config
    let sub = SubscriptionConfig {
        id: sub_id,
        name,
        url,
        enabled: true,
        auto_update_interval: auto_update_interval.unwrap_or(43200), // default 12h
        last_updated: Some(chrono::Utc::now().to_rfc3339()),
        node_count,
        group_id,
        traffic_upload: result.user_info.as_ref().map(|u| u.upload).unwrap_or(0),
        traffic_download: result.user_info.as_ref().map(|u| u.download).unwrap_or(0),
        traffic_total: result.user_info.as_ref().map(|u| u.total).unwrap_or(0),
        expire: result.user_info.as_ref().and_then(|u| u.expire.clone()),
    };

    subs_data.subscriptions.push(sub.clone());
    subscriptions_storage::save_subscriptions(&subs_data)?;

    restart_singbox(&app).await;
    Ok(sub)
}

#[tauri::command]
pub async fn update_subscription(
    app: AppHandle,
    id: String,
) -> Result<SubscriptionConfig, String> {
    let mut subs_data = subscriptions_storage::load_subscriptions();
    let mut nodes_data = nodes_storage::load_nodes();

    let sub = subs_data.subscriptions.iter_mut()
        .find(|s| s.id == id)
        .ok_or_else(|| format!("subscription {} not found", id))?;

    // Fetch new data
    let result = subscription_fetch::fetch_subscription(&sub.url).await?;

    // Replace nodes in the group (full replacement)
    if let Some(group) = nodes_data.groups.iter_mut().find(|g| g.id == sub.group_id) {
        group.nodes = result.nodes;
        group.name = sub.name.clone(); // keep group name in sync
    }
    nodes_storage::save_nodes(&nodes_data)?;

    // Update subscription metadata
    sub.last_updated = Some(chrono::Utc::now().to_rfc3339());
    sub.node_count = nodes_data.groups.iter()
        .find(|g| g.id == sub.group_id)
        .map(|g| g.nodes.len() as u32)
        .unwrap_or(0);
    if let Some(info) = &result.user_info {
        sub.traffic_upload = info.upload;
        sub.traffic_download = info.download;
        sub.traffic_total = info.total;
        sub.expire = info.expire.clone();
    }

    let updated = sub.clone();
    subscriptions_storage::save_subscriptions(&subs_data)?;

    restart_singbox(&app).await;
    Ok(updated)
}

#[tauri::command]
pub async fn update_all_subscriptions(app: AppHandle) -> Result<Vec<SubscriptionConfig>, String> {
    let subs_data = subscriptions_storage::load_subscriptions();
    let enabled_ids: Vec<String> = subs_data.subscriptions.iter()
        .filter(|s| s.enabled)
        .map(|s| s.id.clone())
        .collect();

    let mut results = Vec::new();
    for id in enabled_ids {
        match update_subscription(app.clone(), id).await {
            Ok(sub) => results.push(sub),
            Err(e) => eprintln!("[subscriptions] update failed: {}", e),
        }
    }
    Ok(results)
}

#[tauri::command]
pub async fn delete_subscription(
    app: AppHandle,
    id: String,
) -> Result<(), String> {
    let mut subs_data = subscriptions_storage::load_subscriptions();
    let mut nodes_data = nodes_storage::load_nodes();

    // Find the subscription to get its group_id
    let sub = subs_data.subscriptions.iter()
        .find(|s| s.id == id)
        .ok_or_else(|| format!("subscription {} not found", id))?;
    let group_id = sub.group_id.clone();

    // Remove the node group
    nodes_data.groups.retain(|g| g.id != group_id);
    // If active node was in this group, clear it
    if let Some(active) = &nodes_data.active_node {
        let still_exists = nodes_data.groups.iter()
            .any(|g| g.nodes.iter().any(|n| &n.name == active));
        if !still_exists {
            nodes_data.active_node = None;
        }
    }
    nodes_storage::save_nodes(&nodes_data)?;

    // Remove the subscription
    subs_data.subscriptions.retain(|s| s.id != id);
    subscriptions_storage::save_subscriptions(&subs_data)?;

    restart_singbox(&app).await;
    Ok(())
}

#[tauri::command]
pub async fn edit_subscription(
    id: String,
    name: Option<String>,
    url: Option<String>,
    auto_update_interval: Option<u64>,
) -> Result<SubscriptionConfig, String> {
    let mut subs_data = subscriptions_storage::load_subscriptions();

    let sub = subs_data.subscriptions.iter_mut()
        .find(|s| s.id == id)
        .ok_or_else(|| format!("subscription {} not found", id))?;

    if let Some(name) = name {
        // Also rename the node group
        let mut nodes_data = nodes_storage::load_nodes();
        if let Some(group) = nodes_data.groups.iter_mut().find(|g| g.id == sub.group_id) {
            group.name = name.clone();
        }
        nodes_storage::save_nodes(&nodes_data)?;
        sub.name = name;
    }
    if let Some(url) = url {
        sub.url = url;
    }
    if let Some(interval) = auto_update_interval {
        sub.auto_update_interval = interval;
    }

    let updated = sub.clone();
    subscriptions_storage::save_subscriptions(&subs_data)?;
    Ok(updated)
}

#[tauri::command]
pub async fn toggle_subscription(
    id: String,
    enabled: bool,
) -> Result<SubscriptionConfig, String> {
    let mut subs_data = subscriptions_storage::load_subscriptions();
    let sub = subs_data.subscriptions.iter_mut()
        .find(|s| s.id == id)
        .ok_or_else(|| format!("subscription {} not found", id))?;
    sub.enabled = enabled;
    let updated = sub.clone();
    subscriptions_storage::save_subscriptions(&subs_data)?;
    Ok(updated)
}

async fn restart_singbox(app: &AppHandle) {
    let process = app.state::<Arc<SingboxProcess>>().inner().clone();
    let settings = storage::load_settings();
    match process.restart(&settings).await {
        Ok(()) => {
            eprintln!("[subscriptions] sing-box restarted successfully");
            let _ = app.emit("singbox-restarted", ());
        }
        Err(e) => {
            eprintln!("[subscriptions] sing-box restart failed: {}", e);
            let _ = app.emit("singbox-error", &e);
        }
    }
}
```

- [ ] **Step 2: Add module to commands/mod.rs**

Add `pub mod subscriptions;` to `src-tauri/src/commands/mod.rs`.

- [ ] **Step 3: Register commands in lib.rs**

Add these to the `invoke_handler` in `src-tauri/src/lib.rs`:

```rust
commands::subscriptions::get_subscriptions,
commands::subscriptions::add_subscription,
commands::subscriptions::update_subscription,
commands::subscriptions::update_all_subscriptions,
commands::subscriptions::delete_subscription,
commands::subscriptions::edit_subscription,
commands::subscriptions::toggle_subscription,
```

- [ ] **Step 4: Add uuid dependency to Cargo.toml**

```toml
uuid = { version = "1", features = ["v4"] }
```

- [ ] **Step 5: Verify it compiles**

Run: `cd /Users/linqiankai/calamity && cargo check -p calamity`
Expected: compiles with no errors

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/commands/subscriptions.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs src-tauri/Cargo.toml
git commit -m "feat: add subscription Tauri commands"
```

---

### Task 4: Frontend Service Layer

**Files:**
- Modify: `src/services/subscriptions.ts`

- [ ] **Step 1: Update types and add Tauri implementation**

Replace `src/services/subscriptions.ts` with updated types (add `expire`, custom interval, `trafficUsed` = upload+download) and Tauri implementation alongside existing mock:

```typescript
// src/services/subscriptions.ts
export interface Subscription {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  nodeCount: number;
  lastUpdated: string;
  autoUpdateInterval: number; // seconds, 0 = never
  trafficUsed: number;  // bytes (upload + download)
  trafficTotal: number; // bytes, 0 = unlimited
  expire: string | null; // ISO date string
  status: "active" | "updating" | "error";
}

export interface SubscriptionsService {
  getSubscriptions(): Promise<Subscription[]>;
  addSubscription(input: { name: string; url: string; autoUpdateInterval?: number }): Promise<Subscription>;
  removeSubscription(id: string): Promise<void>;
  updateSubscription(id: string): Promise<Subscription>;
  updateAllSubscriptions(): Promise<void>;
  toggleSubscription(id: string, enabled: boolean): Promise<void>;
  editSubscription(id: string, updates: { name?: string; url?: string; autoUpdateInterval?: number }): Promise<void>;
}

// ---- Mock Implementation ----

let mockSubs: Subscription[] = [
  {
    id: "sub-1",
    name: "Global High-Speed",
    url: "https://provider1.example.com/api/v1/client/subscribe?token=abc123def456",
    enabled: true,
    nodeCount: 128,
    lastUpdated: new Date(Date.now() - 300000).toISOString(),
    autoUpdateInterval: 43200, // 12h
    trafficUsed: 42.5 * 1024 * 1024 * 1024,
    trafficTotal: 1024 * 1024 * 1024 * 1024,
    expire: new Date(Date.now() + 30 * 86400000).toISOString(),
    status: "active",
  },
  {
    id: "sub-2",
    name: "Asia Premium",
    url: "https://provider2.example.com/sub/clash?token=xyz789",
    enabled: true,
    nodeCount: 24,
    lastUpdated: new Date(Date.now() - 3600000).toISOString(),
    autoUpdateInterval: 21600, // 6h
    trafficUsed: 8.2 * 1024 * 1024 * 1024,
    trafficTotal: 50 * 1024 * 1024 * 1024,
    expire: null,
    status: "active",
  },
];

let nextId = 4;

const mockSubscriptionsService: SubscriptionsService = {
  async getSubscriptions() {
    return mockSubs.map((s) => ({ ...s }));
  },
  async addSubscription(input) {
    const sub: Subscription = {
      id: `sub-${nextId++}`,
      name: input.name,
      url: input.url,
      enabled: true,
      nodeCount: Math.floor(Math.random() * 50) + 5,
      lastUpdated: new Date().toISOString(),
      autoUpdateInterval: input.autoUpdateInterval ?? 43200,
      trafficUsed: 0,
      trafficTotal: 0,
      expire: null,
      status: "active",
    };
    mockSubs.push(sub);
    return { ...sub };
  },
  async removeSubscription(id) {
    mockSubs = mockSubs.filter((s) => s.id !== id);
  },
  async updateSubscription(id) {
    const sub = mockSubs.find((s) => s.id === id);
    if (sub) {
      sub.lastUpdated = new Date().toISOString();
      sub.nodeCount = Math.floor(Math.random() * 50) + 5;
    }
    return { ...sub! };
  },
  async updateAllSubscriptions() {
    for (const sub of mockSubs) {
      if (sub.enabled) {
        sub.lastUpdated = new Date().toISOString();
      }
    }
  },
  async toggleSubscription(id, enabled) {
    const sub = mockSubs.find((s) => s.id === id);
    if (sub) sub.enabled = enabled;
  },
  async editSubscription(id, updates) {
    const sub = mockSubs.find((s) => s.id === id);
    if (sub) {
      if (updates.name !== undefined) sub.name = updates.name;
      if (updates.url !== undefined) sub.url = updates.url;
      if (updates.autoUpdateInterval !== undefined) sub.autoUpdateInterval = updates.autoUpdateInterval;
    }
  },
};

// ---- Tauri Implementation ----

interface RawSubscriptionConfig {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  autoUpdateInterval: number;
  lastUpdated: string | null;
  nodeCount: number;
  groupId: string;
  trafficUpload: number;
  trafficDownload: number;
  trafficTotal: number;
  expire: string | null;
}

interface RawSubscriptionsData {
  subscriptions: RawSubscriptionConfig[];
}

function toSubscription(raw: RawSubscriptionConfig): Subscription {
  return {
    id: raw.id,
    name: raw.name,
    url: raw.url,
    enabled: raw.enabled,
    nodeCount: raw.nodeCount,
    lastUpdated: raw.lastUpdated ?? new Date().toISOString(),
    autoUpdateInterval: raw.autoUpdateInterval,
    trafficUsed: raw.trafficUpload + raw.trafficDownload,
    trafficTotal: raw.trafficTotal,
    expire: raw.expire,
    status: "active",
  };
}

function createTauriSubscriptionsService(): SubscriptionsService {
  return {
    async getSubscriptions() {
      const { invoke } = await import("@tauri-apps/api/core");
      const raw = await invoke<RawSubscriptionsData>("get_subscriptions");
      return raw.subscriptions.map(toSubscription);
    },
    async addSubscription(input) {
      const { invoke } = await import("@tauri-apps/api/core");
      const raw = await invoke<RawSubscriptionConfig>("add_subscription", {
        name: input.name,
        url: input.url,
        autoUpdateInterval: input.autoUpdateInterval ?? null,
      });
      return toSubscription(raw);
    },
    async removeSubscription(id) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("delete_subscription", { id });
    },
    async updateSubscription(id) {
      const { invoke } = await import("@tauri-apps/api/core");
      const raw = await invoke<RawSubscriptionConfig>("update_subscription", { id });
      return toSubscription(raw);
    },
    async updateAllSubscriptions() {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("update_all_subscriptions");
    },
    async toggleSubscription(id, enabled) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("toggle_subscription", { id, enabled });
    },
    async editSubscription(id, updates) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("edit_subscription", {
        id,
        name: updates.name ?? null,
        url: updates.url ?? null,
        autoUpdateInterval: updates.autoUpdateInterval ?? null,
      });
    },
  };
}

// ---- Export ----

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
export const subscriptionsService: SubscriptionsService = isTauri
  ? createTauriSubscriptionsService()
  : mockSubscriptionsService;
```

- [ ] **Step 2: Run tests**

Run: `cd /Users/linqiankai/calamity && npx vitest run src/services/__tests__/subscriptions.test.ts`
Expected: Tests need updating due to interface changes

- [ ] **Step 3: Update tests to match new interface**

```typescript
// src/services/__tests__/subscriptions.test.ts
import { describe, it, expect } from "vitest";
import { subscriptionsService } from "../subscriptions";

describe("subscriptionsService", () => {
  it("getSubscriptions returns initial list", async () => {
    const subs = await subscriptionsService.getSubscriptions();
    expect(subs.length).toBeGreaterThan(0);
    expect(subs[0]).toHaveProperty("id");
    expect(subs[0]).toHaveProperty("name");
    expect(subs[0]).toHaveProperty("url");
    expect(subs[0]).toHaveProperty("nodeCount");
    expect(subs[0]).toHaveProperty("trafficUsed");
    expect(subs[0]).toHaveProperty("trafficTotal");
    expect(subs[0]).toHaveProperty("autoUpdateInterval");
    expect(subs[0]).toHaveProperty("expire");
    expect(typeof subs[0].autoUpdateInterval).toBe("number");
  });

  it("addSubscription creates a new entry", async () => {
    const before = await subscriptionsService.getSubscriptions();
    const sub = await subscriptionsService.addSubscription({
      name: "Test Sub",
      url: "https://example.com/sub",
    });
    expect(sub.id).toBeTruthy();
    expect(sub.name).toBe("Test Sub");
    expect(sub.enabled).toBe(true);
    const after = await subscriptionsService.getSubscriptions();
    expect(after.length).toBe(before.length + 1);
  });

  it("removeSubscription deletes by id", async () => {
    const subs = await subscriptionsService.getSubscriptions();
    const last = subs[subs.length - 1];
    await subscriptionsService.removeSubscription(last.id);
    const after = await subscriptionsService.getSubscriptions();
    expect(after.find((s) => s.id === last.id)).toBeUndefined();
  });

  it("updateSubscription refreshes lastUpdated", async () => {
    const subs = await subscriptionsService.getSubscriptions();
    const target = subs[0];
    await subscriptionsService.updateSubscription(target.id);
    const after = await subscriptionsService.getSubscriptions();
    const updated = after.find((s) => s.id === target.id)!;
    expect(new Date(updated.lastUpdated).getTime()).toBeGreaterThanOrEqual(
      new Date(target.lastUpdated).getTime()
    );
  });

  it("toggleSubscription changes enabled state", async () => {
    const subs = await subscriptionsService.getSubscriptions();
    const target = subs[0];
    await subscriptionsService.toggleSubscription(target.id, false);
    const after = await subscriptionsService.getSubscriptions();
    expect(after.find((s) => s.id === target.id)!.enabled).toBe(false);
    await subscriptionsService.toggleSubscription(target.id, true);
  });

  it("editSubscription changes name and interval", async () => {
    const subs = await subscriptionsService.getSubscriptions();
    const target = subs[0];
    await subscriptionsService.editSubscription(target.id, {
      name: "Renamed",
      autoUpdateInterval: 86400,
    });
    const after = await subscriptionsService.getSubscriptions();
    const updated = after.find((s) => s.id === target.id)!;
    expect(updated.name).toBe("Renamed");
    expect(updated.autoUpdateInterval).toBe(86400);
  });
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/linqiankai/calamity && npx vitest run src/services/__tests__/subscriptions.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/subscriptions.ts src/services/__tests__/subscriptions.test.ts
git commit -m "feat: update subscription service with Tauri implementation"
```

---

### Task 5: Frontend Store Update

**Files:**
- Modify: `src/stores/subscriptions.ts`

- [ ] **Step 1: Update store to match new service interface**

```typescript
// src/stores/subscriptions.ts
import { create } from "zustand";
import { subscriptionsService, type Subscription } from "../services/subscriptions";

interface SubscriptionsStore {
  subscriptions: Subscription[];
  fetchSubscriptions: () => Promise<void>;
  addSubscription: (name: string, url: string, autoUpdateInterval?: number) => Promise<void>;
  removeSubscription: (id: string) => Promise<void>;
  updateSubscription: (id: string) => Promise<void>;
  updateAllSubscriptions: () => Promise<void>;
  toggleSubscription: (id: string, enabled: boolean) => Promise<void>;
  editSubscription: (id: string, updates: { name?: string; url?: string; autoUpdateInterval?: number }) => Promise<void>;
}

export const useSubscriptionsStore = create<SubscriptionsStore>((set, get) => ({
  subscriptions: [],

  async fetchSubscriptions() {
    const subscriptions = await subscriptionsService.getSubscriptions();
    set({ subscriptions });
  },
  async addSubscription(name, url, autoUpdateInterval) {
    await subscriptionsService.addSubscription({ name, url, autoUpdateInterval });
    await get().fetchSubscriptions();
  },
  async removeSubscription(id) {
    await subscriptionsService.removeSubscription(id);
    await get().fetchSubscriptions();
  },
  async updateSubscription(id) {
    await subscriptionsService.updateSubscription(id);
    await get().fetchSubscriptions();
  },
  async updateAllSubscriptions() {
    await subscriptionsService.updateAllSubscriptions();
    await get().fetchSubscriptions();
  },
  async toggleSubscription(id, enabled) {
    await subscriptionsService.toggleSubscription(id, enabled);
    await get().fetchSubscriptions();
  },
  async editSubscription(id, updates) {
    await subscriptionsService.editSubscription(id, updates);
    await get().fetchSubscriptions();
  },
}));
```

- [ ] **Step 2: Run all frontend tests**

Run: `cd /Users/linqiankai/calamity && npx vitest run`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add src/stores/subscriptions.ts
git commit -m "feat: update subscription store for new service interface"
```

---

### Task 6: Frontend UI Updates

**Files:**
- Modify: `src/pages/SubscriptionsPage.tsx`

- [ ] **Step 1: Update SubscriptionsPage with custom interval, expire display, and loading states**

Key changes:
1. Replace `AutoUpdateInterval` string type with numeric seconds
2. Add custom interval input option
3. Display expire date
4. Add loading states for add/update/delete actions
5. Add "Update All" button

```typescript
// src/pages/SubscriptionsPage.tsx
import { useEffect, useState } from "react";
import { Plus, RefreshCw, Trash2, Copy, Link, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSubscriptionsStore } from "@/stores/subscriptions";
import { cn } from "@/lib/utils";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0";
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes < 1024 * 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  return `${(bytes / (1024 * 1024 * 1024 * 1024)).toFixed(2)} TB`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)} min ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

function formatExpire(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  const diff = date.getTime() - Date.now();
  if (diff < 0) return "Expired";
  if (diff < 86400000) return "< 1 day";
  return `${Math.floor(diff / 86400000)} days`;
}

const INTERVAL_PRESETS: { label: string; value: number }[] = [
  { label: "1h", value: 3600 },
  { label: "6h", value: 21600 },
  { label: "12h", value: 43200 },
  { label: "24h", value: 86400 },
  { label: "Off", value: 0 },
];

function intervalToSelectValue(seconds: number): string {
  const preset = INTERVAL_PRESETS.find((p) => p.value === seconds);
  return preset ? String(preset.value) : "custom";
}

export function SubscriptionsPage() {
  const {
    subscriptions, fetchSubscriptions, addSubscription,
    removeSubscription, updateSubscription, updateAllSubscriptions,
    toggleSubscription, editSubscription,
  } = useSubscriptionsStore();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());
  const [updatingAll, setUpdatingAll] = useState(false);

  useEffect(() => {
    fetchSubscriptions();
  }, [fetchSubscriptions]);

  const totalNodes = subscriptions.reduce((acc, s) => acc + (s.enabled ? s.nodeCount : 0), 0);
  const totalTrafficUsed = subscriptions.reduce((acc, s) => acc + s.trafficUsed, 0);
  const totalTrafficTotal = subscriptions.reduce((acc, s) => acc + s.trafficTotal, 0);
  const activeCount = subscriptions.filter((s) => s.enabled).length;

  const handleAdd = async () => {
    if (!url || adding) return;
    setAdding(true);
    try {
      await addSubscription(name || "Untitled", url);
      setName("");
      setUrl("");
    } finally {
      setAdding(false);
    }
  };

  const handleUpdate = async (id: string) => {
    setUpdatingIds((prev) => new Set(prev).add(id));
    try {
      await updateSubscription(id);
    } finally {
      setUpdatingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleUpdateAll = async () => {
    setUpdatingAll(true);
    try {
      await updateAllSubscriptions();
    } finally {
      setUpdatingAll(false);
    }
  };

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between animate-slide-up">
        <div>
          <h1 className="text-xl font-semibold">Subscriptions</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Manage proxy subscription links</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="border-white/[0.06] text-xs"
          onClick={handleUpdateAll}
          disabled={updatingAll}
        >
          {updatingAll ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1.5 h-3 w-3" />}
          Update All
        </Button>
      </div>

      {/* Add Subscription */}
      <div className="rounded-xl border border-white/[0.06] bg-card/40 backdrop-blur-xl p-4 animate-slide-up" style={{ animationDelay: "80ms" }}>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Link className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Subscription URL"
              className="pl-9 bg-muted/30 border-white/[0.06] h-9 text-xs font-mono"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>
          <Input
            placeholder="Name"
            className="w-40 bg-muted/30 border-white/[0.06] h-9 text-xs"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button
            className="h-9 text-xs shadow-[0_0_15px_rgba(254,151,185,0.15)]"
            disabled={!url || adding}
            onClick={handleAdd}
          >
            {adding ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : <Plus className="mr-1.5 h-3 w-3" />}
            {adding ? "Adding..." : "Add"}
          </Button>
        </div>
      </div>

      {/* Subscription Cards */}
      <div className="space-y-3">
        {subscriptions.map((sub, i) => {
          const isUpdating = updatingIds.has(sub.id);
          const expireText = formatExpire(sub.expire);
          return (
            <div
              key={sub.id}
              className={cn(
                "rounded-xl border bg-card/40 backdrop-blur-xl p-5 space-y-3 transition-all duration-200 animate-slide-up",
                sub.enabled ? "border-white/[0.06]" : "border-white/[0.04] opacity-60"
              )}
              style={{ animationDelay: `${(i + 2) * 80}ms` }}
            >
              {/* Row 1: Name + Toggle */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-sm">{sub.name}</h3>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[9px] uppercase",
                      sub.status === "active" && "border-green-500/30 bg-green-500/10 text-green-400",
                      sub.status === "updating" && "border-yellow-500/30 bg-yellow-500/10 text-yellow-400",
                      sub.status === "error" && "border-red-500/30 bg-red-500/10 text-red-400"
                    )}
                  >
                    {(sub.status === "updating" || isUpdating) && <Loader2 className="mr-1 h-2 w-2 animate-spin" />}
                    {isUpdating ? "updating" : sub.status}
                  </Badge>
                </div>
                <Switch
                  checked={sub.enabled}
                  onCheckedChange={(v) => toggleSubscription(sub.id, v)}
                />
              </div>

              {/* Row 2: URL */}
              <div className="flex items-center gap-2">
                <p className="text-[11px] font-mono text-muted-foreground truncate flex-1">{sub.url}</p>
                <button
                  onClick={() => navigator.clipboard?.writeText(sub.url)}
                  className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                >
                  <Copy className="h-3 w-3" />
                </button>
              </div>

              {/* Row 3: Stats */}
              <div className="flex items-center gap-4 text-xs flex-wrap">
                <span className="text-muted-foreground">
                  <span className="font-semibold text-foreground">{sub.nodeCount}</span> nodes
                </span>
                <div className="h-3 w-px bg-white/10" />
                <span className="text-muted-foreground">Updated {timeAgo(sub.lastUpdated)}</span>
                {expireText && (
                  <>
                    <div className="h-3 w-px bg-white/10" />
                    <span className={cn("text-muted-foreground", expireText === "Expired" && "text-red-400")}>
                      Expires: {expireText}
                    </span>
                  </>
                )}
                <div className="h-3 w-px bg-white/10" />
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">Auto:</span>
                  <Select
                    value={intervalToSelectValue(sub.autoUpdateInterval)}
                    onValueChange={(v) => {
                      if (v === "custom") return;
                      editSubscription(sub.id, { autoUpdateInterval: Number(v) });
                    }}
                  >
                    <SelectTrigger className="h-6 w-20 bg-muted/30 border-white/[0.06] text-[10px] px-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INTERVAL_PRESETS.map((p) => (
                        <SelectItem key={p.value} value={String(p.value)}>
                          {p.label}
                        </SelectItem>
                      ))}
                      <SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                  {intervalToSelectValue(sub.autoUpdateInterval) === "custom" && (
                    <Input
                      type="number"
                      className="w-16 h-6 bg-muted/30 border-white/[0.06] text-[10px] px-2"
                      value={Math.floor(sub.autoUpdateInterval / 60)}
                      onChange={(e) => {
                        const mins = parseInt(e.target.value) || 0;
                        editSubscription(sub.id, { autoUpdateInterval: mins * 60 });
                      }}
                      placeholder="min"
                    />
                  )}
                </div>
              </div>

              {/* Row 4: Traffic Bar */}
              {sub.trafficTotal > 0 && (
                <div className="space-y-1">
                  <div className="h-1.5 rounded-full bg-muted/30 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-primary to-pink-400 transition-all duration-500"
                      style={{ width: `${Math.min(100, (sub.trafficUsed / sub.trafficTotal) * 100)}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    {formatBytes(sub.trafficUsed)} / {formatBytes(sub.trafficTotal)}
                  </p>
                </div>
              )}

              {/* Row 5: Actions */}
              <div className="flex items-center justify-end gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-[11px] border-white/[0.06]"
                  onClick={() => handleUpdate(sub.id)}
                  disabled={isUpdating}
                >
                  <RefreshCw className={cn("mr-1 h-3 w-3", isUpdating && "animate-spin")} />
                  Update Now
                </Button>
                <button
                  onClick={() => removeSubscription(sub.id)}
                  className="text-muted-foreground hover:text-destructive transition-colors p-1"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom Stats */}
      <div className="flex items-center justify-center gap-6 text-xs text-muted-foreground animate-slide-up" style={{ animationDelay: "400ms" }}>
        <span><span className="font-semibold text-foreground">{activeCount}</span> active subscriptions</span>
        <div className="h-3 w-px bg-white/10" />
        <span><span className="font-semibold text-foreground">{totalNodes}</span> total nodes</span>
        {totalTrafficTotal > 0 && (
          <>
            <div className="h-3 w-px bg-white/10" />
            <span>{formatBytes(totalTrafficUsed)} / {formatBytes(totalTrafficTotal)}</span>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run all frontend tests**

Run: `cd /Users/linqiankai/calamity && npx vitest run`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add src/pages/SubscriptionsPage.tsx src/stores/subscriptions.ts
git commit -m "feat: update subscriptions UI with loading states, expire display, and custom interval"
```

---

### Task 7: Auto-Update Timer (Rust)

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add auto-update spawn in setup**

In `src-tauri/src/lib.rs`, inside the `.setup(|app| { ... })` closure, after the sing-box start block, add the subscription auto-update timer:

```rust
// Auto-update subscriptions
let app_handle_subs = app.handle().clone();
tauri::async_runtime::spawn(async move {
    // Wait for initial startup
    tokio::time::sleep(std::time::Duration::from_secs(10)).await;

    loop {
        let subs = crate::singbox::subscriptions_storage::load_subscriptions();
        let now = chrono::Utc::now();

        for sub in &subs.subscriptions {
            if !sub.enabled || sub.auto_update_interval == 0 {
                continue;
            }
            let should_update = match &sub.last_updated {
                Some(last) => {
                    if let Ok(last_dt) = chrono::DateTime::parse_from_rfc3339(last) {
                        let elapsed = (now - last_dt.with_timezone(&chrono::Utc)).num_seconds();
                        elapsed >= sub.auto_update_interval as i64
                    } else {
                        true
                    }
                }
                None => true,
            };

            if should_update {
                eprintln!("[subscriptions] auto-updating: {}", sub.name);
                let _ = crate::commands::subscriptions::update_subscription(
                    app_handle_subs.clone(),
                    sub.id.clone(),
                ).await;
            }
        }

        // Check every 60 seconds
        tokio::time::sleep(std::time::Duration::from_secs(60)).await;
    }
});
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /Users/linqiankai/calamity && cargo check -p calamity`
Expected: compiles with no errors

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat: add subscription auto-update timer"
```

---

### Task 8: Integration Test

- [ ] **Step 1: Build and run the app**

Run: `cd /Users/linqiankai/calamity && cargo tauri dev`

- [ ] **Step 2: Test adding a subscription**

Navigate to the Subscriptions page. Add a subscription with:
- Name: "Test"
- URL: the user's v2ray subscription URL

Verify:
- Loading spinner shows during fetch
- Subscription card appears with node count
- Nodes page shows a new "Test" group with imported nodes
- Traffic bar shows if the provider returns `subscription-userinfo`

- [ ] **Step 3: Test update subscription**

Click "Update Now" on the subscription card. Verify:
- Spinner shows during update
- Node count refreshes
- `lastUpdated` changes to "just now"

- [ ] **Step 4: Test delete subscription**

Delete the test subscription. Verify:
- Subscription card disappears
- Node group is removed from Nodes page

- [ ] **Step 5: Run all frontend tests**

Run: `cd /Users/linqiankai/calamity && npx vitest run`
Expected: All tests pass

- [ ] **Step 6: Commit any fixes**

```bash
git add -A
git commit -m "fix: integration test fixes for subscriptions"
```
