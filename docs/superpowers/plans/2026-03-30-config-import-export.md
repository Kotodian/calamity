# Config Import/Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add config backup/restore (`.calamity` format) and external sing-box JSON import to the Settings page.

**Architecture:** A new Rust module `config_io` handles both export (bundling 5 JSON storage files) and import (auto-detecting Calamity backup vs sing-box native format). The frontend adds two buttons to the Settings page that open native file dialogs via `tauri-plugin-dialog`. Sing-box native import parses `outbounds` into nodes, `route.rules` into rules, `dns` into DNS config, and `inbounds` into settings, skipping unsupported protocols with a summary.

**Tech Stack:** Rust (serde_json), tauri-plugin-dialog, React/TypeScript, Zustand

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src-tauri/src/singbox/config_io.rs` | Core import/export logic: serialize/deserialize Calamity backup, parse sing-box native config into internal types |
| Modify | `src-tauri/src/singbox/mod.rs` | Add `pub mod config_io;` |
| Create | `src-tauri/src/commands/config_io.rs` | Tauri commands: `export_config`, `import_config` |
| Modify | `src-tauri/src/commands/mod.rs` | Add `pub mod config_io;` |
| Modify | `src-tauri/src/lib.rs` | Register new commands, add dialog plugin |
| Modify | `src-tauri/Cargo.toml` | Add `tauri-plugin-dialog` dependency |
| Modify | `package.json` | Add `@tauri-apps/plugin-dialog` dependency |
| Modify | `src/pages/SettingsPage.tsx` | Add Import/Export buttons + result toast |
| Modify | `src/i18n/resources.ts` | Add i18n strings for import/export |
| Create | `src-tauri/src/singbox/config_io_test.rs` | Tests for import/export logic |

---

### Task 1: Add tauri-plugin-dialog dependency

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `package.json`
- Modify: `src-tauri/src/lib.rs:15-18`

- [ ] **Step 1: Add Rust dependency**

In `src-tauri/Cargo.toml`, add to `[dependencies]`:

```toml
tauri-plugin-dialog = "2"
```

- [ ] **Step 2: Add JS dependency**

```bash
cd /Users/linqiankai/calamity && npm install @tauri-apps/plugin-dialog
```

- [ ] **Step 3: Register dialog plugin in lib.rs**

In `src-tauri/src/lib.rs`, add after the autostart plugin init (line 18):

```rust
.plugin(tauri_plugin_dialog::init())
```

- [ ] **Step 4: Verify it compiles**

```bash
cd /Users/linqiankai/calamity/src-tauri && cargo check
```

Expected: compiles without errors.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/Cargo.toml package.json package-lock.json src-tauri/src/lib.rs
git commit -m "chore: add tauri-plugin-dialog dependency"
```

---

### Task 2: Implement Calamity backup export

**Files:**
- Create: `src-tauri/src/singbox/config_io.rs`
- Modify: `src-tauri/src/singbox/mod.rs`

- [ ] **Step 1: Add module declaration**

In `src-tauri/src/singbox/mod.rs`, add:

```rust
pub mod config_io;
```

- [ ] **Step 2: Write the export function**

Create `src-tauri/src/singbox/config_io.rs`:

```rust
use chrono::Utc;
use serde_json::{json, Value};

use super::dns_storage;
use super::nodes_storage;
use super::rules_storage;
use super::storage;
use super::subscriptions_storage;

/// Bundle all 5 config files into a single Calamity backup JSON.
pub fn export_backup() -> Value {
    let settings = storage::load_settings();
    let nodes = nodes_storage::load_nodes();
    let rules = rules_storage::load_rules();
    let dns = dns_storage::load_dns_settings();
    let subscriptions = subscriptions_storage::load_subscriptions();

    json!({
        "version": 1,
        "exportedAt": Utc::now().to_rfc3339(),
        "settings": serde_json::to_value(&settings).unwrap_or_default(),
        "nodes": serde_json::to_value(&nodes).unwrap_or_default(),
        "rules": serde_json::to_value(&rules).unwrap_or_default(),
        "dns": serde_json::to_value(&dns).unwrap_or_default(),
        "subscriptions": serde_json::to_value(&subscriptions).unwrap_or_default(),
    })
}
```

- [ ] **Step 3: Verify it compiles**

```bash
cd /Users/linqiankai/calamity/src-tauri && cargo check
```

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/singbox/config_io.rs src-tauri/src/singbox/mod.rs
git commit -m "feat: implement Calamity backup export"
```

---

### Task 3: Implement Calamity backup restore

**Files:**
- Modify: `src-tauri/src/singbox/config_io.rs`

- [ ] **Step 1: Write the restore function**

Append to `src-tauri/src/singbox/config_io.rs`:

```rust
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub success: bool,
    pub format: String,          // "calamity" or "singbox"
    pub nodes_imported: usize,
    pub nodes_skipped: usize,
    pub rules_imported: usize,
    pub dns_servers_imported: usize,
    pub message: String,
}

/// Detect format and dispatch to the right importer.
pub fn import_config(content: &str) -> Result<ImportResult, String> {
    let json: Value = serde_json::from_str(content)
        .map_err(|e| format!("Invalid JSON: {}", e))?;

    if json.get("version").is_some() {
        restore_backup(&json)
    } else if json.get("outbounds").is_some() || json.get("inbounds").is_some() {
        import_singbox_native(&json)
    } else {
        Err("Unknown config format: expected Calamity backup (has \"version\") or sing-box config (has \"outbounds\")".to_string())
    }
}

/// Restore a Calamity backup: overwrite all 5 storage files.
fn restore_backup(json: &Value) -> Result<ImportResult, String> {
    // Settings
    if let Some(settings_val) = json.get("settings") {
        let settings: storage::AppSettings = serde_json::from_value(settings_val.clone())
            .map_err(|e| format!("Invalid settings in backup: {}", e))?;
        storage::save_settings(&settings)?;
    }

    // Nodes
    let mut nodes_count = 0;
    if let Some(nodes_val) = json.get("nodes") {
        let nodes: nodes_storage::NodesData = serde_json::from_value(nodes_val.clone())
            .map_err(|e| format!("Invalid nodes in backup: {}", e))?;
        nodes_count = nodes.groups.iter().map(|g| g.nodes.len()).sum();
        nodes_storage::save_nodes(&nodes)?;
    }

    // Rules
    let mut rules_count = 0;
    if let Some(rules_val) = json.get("rules") {
        let rules: rules_storage::RulesData = serde_json::from_value(rules_val.clone())
            .map_err(|e| format!("Invalid rules in backup: {}", e))?;
        rules_count = rules.rules.len();
        rules_storage::save_rules(&rules)?;
    }

    // DNS
    let mut dns_count = 0;
    if let Some(dns_val) = json.get("dns") {
        let dns: dns_storage::DnsSettings = serde_json::from_value(dns_val.clone())
            .map_err(|e| format!("Invalid DNS in backup: {}", e))?;
        dns_count = dns.servers.len();
        dns_storage::save_dns_settings(&dns)?;
    }

    // Subscriptions
    if let Some(subs_val) = json.get("subscriptions") {
        let subs: subscriptions_storage::SubscriptionsData = serde_json::from_value(subs_val.clone())
            .map_err(|e| format!("Invalid subscriptions in backup: {}", e))?;
        subscriptions_storage::save_subscriptions(&subs)?;
    }

    Ok(ImportResult {
        success: true,
        format: "calamity".to_string(),
        nodes_imported: nodes_count,
        nodes_skipped: 0,
        rules_imported: rules_count,
        dns_servers_imported: dns_count,
        message: "Backup restored successfully".to_string(),
    })
}
```

- [ ] **Step 2: Add a placeholder for sing-box native import (next task)**

```rust
fn import_singbox_native(_json: &Value) -> Result<ImportResult, String> {
    Err("sing-box native import not yet implemented".to_string())
}
```

- [ ] **Step 3: Verify it compiles**

```bash
cd /Users/linqiankai/calamity/src-tauri && cargo check
```

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/singbox/config_io.rs
git commit -m "feat: implement Calamity backup restore"
```

---

### Task 4: Implement sing-box native config import

**Files:**
- Modify: `src-tauri/src/singbox/config_io.rs`

This is the most complex task. We need to reverse-map sing-box JSON outbounds back to Calamity's `ProxyNode` format, and extract route rules, DNS config, and inbound settings.

- [ ] **Step 1: Replace the placeholder `import_singbox_native` with the full implementation**

Replace the placeholder in `config_io.rs`:

```rust
use super::nodes_storage::{NodesData, NodeGroup, ProxyNode};
use super::rules_storage::{RulesData, RouteRuleConfig};
use super::dns_storage::{DnsSettings, DnsServerConfig, DnsRuleConfig};
use uuid::Uuid;

/// Supported outbound types that we can convert to ProxyNode.
const SUPPORTED_PROTOCOLS: &[&str] = &[
    "vmess", "vless", "trojan", "shadowsocks", "hysteria2", "tuic", "anytls",
];

fn import_singbox_native(json: &Value) -> Result<ImportResult, String> {
    let mut nodes_imported = 0;
    let mut nodes_skipped = 0;
    let mut rules_imported = 0;
    let mut dns_servers_imported = 0;

    // --- 1. Parse outbounds → nodes ---
    let mut proxy_nodes: Vec<ProxyNode> = Vec::new();

    if let Some(outbounds) = json.get("outbounds").and_then(|v| v.as_array()) {
        for ob in outbounds {
            let ob_type = ob.get("type").and_then(|v| v.as_str()).unwrap_or("");
            if !SUPPORTED_PROTOCOLS.contains(&ob_type) {
                if ob_type != "direct" && ob_type != "block" && ob_type != "dns"
                    && ob_type != "selector" && ob_type != "urltest" {
                    nodes_skipped += 1;
                }
                continue;
            }
            match parse_outbound_to_node(ob) {
                Some(node) => {
                    proxy_nodes.push(node);
                    nodes_imported += 1;
                }
                None => {
                    nodes_skipped += 1;
                }
            }
        }
    }

    let nodes_data = NodesData {
        groups: vec![NodeGroup {
            id: "imported".to_string(),
            name: "Imported".to_string(),
            group_type: "select".to_string(),
            nodes: proxy_nodes,
        }],
        active_node: None,
    };
    nodes_storage::save_nodes(&nodes_data)?;

    // --- 2. Parse route → rules ---
    let mut route_rules: Vec<RouteRuleConfig> = Vec::new();
    let mut final_outbound = "proxy".to_string();

    if let Some(route) = json.get("route").and_then(|v| v.as_object()) {
        if let Some(fin) = route.get("final").and_then(|v| v.as_str()) {
            final_outbound = normalize_outbound_name(fin);
        }

        if let Some(rules) = route.get("rules").and_then(|v| v.as_array()) {
            for (i, rule) in rules.iter().enumerate() {
                if let Some(parsed) = parse_route_rule(rule, i) {
                    route_rules.push(parsed);
                    rules_imported += 1;
                }
            }
        }
    }

    let rules_data = RulesData {
        rules: route_rules,
        final_outbound,
        final_outbound_node: None,
        update_interval: 86400,
    };
    rules_storage::save_rules(&rules_data)?;

    // --- 3. Parse dns → dns settings ---
    let dns_settings = if let Some(dns) = json.get("dns").and_then(|v| v.as_object()) {
        let mut servers: Vec<DnsServerConfig> = Vec::new();
        let mut dns_rules: Vec<DnsRuleConfig> = Vec::new();

        if let Some(svrs) = dns.get("servers").and_then(|v| v.as_array()) {
            for s in svrs {
                if let Some(parsed) = parse_dns_server(s) {
                    servers.push(parsed);
                    dns_servers_imported += 1;
                }
            }
        }

        if let Some(rls) = dns.get("rules").and_then(|v| v.as_array()) {
            for r in rls {
                if let Some(parsed) = parse_dns_rule(r) {
                    dns_rules.push(parsed);
                }
            }
        }

        let final_server = dns.get("final").and_then(|v| v.as_str())
            .unwrap_or("dns-direct").to_string();

        DnsSettings {
            mode: "redir-host".to_string(),
            fake_ip_range: "198.18.0.0/15".to_string(),
            final_server,
            servers,
            rules: dns_rules,
        }
    } else {
        DnsSettings::default()
    };
    dns_storage::save_dns_settings(&dns_settings)?;

    // --- 4. Parse inbounds → settings (ports, TUN) ---
    let mut settings = storage::AppSettings::default();
    if let Some(inbounds) = json.get("inbounds").and_then(|v| v.as_array()) {
        for inbound in inbounds {
            let ib_type = inbound.get("type").and_then(|v| v.as_str()).unwrap_or("");
            let port = inbound.get("listen_port").and_then(|v| v.as_u64()).unwrap_or(0) as u16;
            match ib_type {
                "mixed" => settings.mixed_port = port,
                "http" => settings.http_port = port,
                "socks" => settings.socks_port = port,
                "tun" => {
                    settings.enhanced_mode = true;
                    if let Some(stack) = inbound.get("stack").and_then(|v| v.as_str()) {
                        settings.tun_config.stack = stack.to_string();
                    }
                    if let Some(mtu) = inbound.get("mtu").and_then(|v| v.as_u64()) {
                        settings.tun_config.mtu = mtu as u16;
                    }
                    if let Some(ar) = inbound.get("auto_route").and_then(|v| v.as_bool()) {
                        settings.tun_config.auto_route = ar;
                    }
                    if let Some(sr) = inbound.get("strict_route").and_then(|v| v.as_bool()) {
                        settings.tun_config.strict_route = sr;
                    }
                }
                _ => {}
            }
        }
    }
    if let Some(log) = json.get("log").and_then(|v| v.as_object()) {
        if let Some(level) = log.get("level").and_then(|v| v.as_str()) {
            settings.log_level = level.to_string();
        }
    }
    storage::save_settings(&settings)?;

    // Clear subscriptions (external config has none)
    subscriptions_storage::save_subscriptions(&subscriptions_storage::SubscriptionsData {
        subscriptions: vec![],
    })?;

    let skipped_msg = if nodes_skipped > 0 {
        format!(", {} unsupported nodes skipped", nodes_skipped)
    } else {
        String::new()
    };

    Ok(ImportResult {
        success: true,
        format: "singbox".to_string(),
        nodes_imported,
        nodes_skipped,
        rules_imported,
        dns_servers_imported,
        message: format!(
            "Imported {} nodes, {} rules, {} DNS servers{}",
            nodes_imported, rules_imported, dns_servers_imported, skipped_msg
        ),
    })
}

/// Convert a sing-box outbound JSON to a Calamity ProxyNode.
fn parse_outbound_to_node(ob: &Value) -> Option<ProxyNode> {
    let ob_type = ob.get("type")?.as_str()?;
    let tag = ob.get("tag").and_then(|v| v.as_str()).unwrap_or("unknown");
    let server = ob.get("server").and_then(|v| v.as_str()).unwrap_or("");
    let port = ob.get("server_port").and_then(|v| v.as_u64()).unwrap_or(0) as u16;

    if server.is_empty() || port == 0 {
        return None;
    }

    let protocol_config = match ob_type {
        "vmess" => {
            let mut config = json!({
                "type": "vmess",
                "uuid": ob.get("uuid")?.as_str()?,
                "alterId": ob.get("alter_id").and_then(|v| v.as_i64()).unwrap_or(0),
                "security": ob.get("security").and_then(|v| v.as_str()).unwrap_or("auto"),
            });
            apply_tls_from_singbox(&mut config, ob);
            apply_transport_from_singbox(&mut config, ob);
            config
        }
        "vless" => {
            let mut config = json!({
                "type": "vless",
                "uuid": ob.get("uuid")?.as_str()?,
            });
            if let Some(flow) = ob.get("flow").and_then(|v| v.as_str()) {
                config["flow"] = json!(flow);
            }
            apply_tls_from_singbox(&mut config, ob);
            apply_transport_from_singbox(&mut config, ob);
            config
        }
        "trojan" => {
            let mut config = json!({
                "type": "trojan",
                "password": ob.get("password")?.as_str()?,
            });
            apply_tls_from_singbox(&mut config, ob);
            apply_transport_from_singbox(&mut config, ob);
            config
        }
        "shadowsocks" => {
            json!({
                "type": "shadowsocks",
                "password": ob.get("password")?.as_str()?,
                "method": ob.get("method")?.as_str()?,
            })
        }
        "hysteria2" => {
            let mut config = json!({
                "type": "hysteria2",
                "password": ob.get("password")?.as_str()?,
            });
            if let Some(up) = ob.get("up_mbps").and_then(|v| v.as_i64()) {
                config["upMbps"] = json!(up);
            }
            if let Some(down) = ob.get("down_mbps").and_then(|v| v.as_i64()) {
                config["downMbps"] = json!(down);
            }
            if let Some(obfs) = ob.get("obfs").and_then(|v| v.as_object()) {
                if let Some(t) = obfs.get("type").and_then(|v| v.as_str()) {
                    config["obfsType"] = json!(t);
                    config["obfsPassword"] = json!(obfs.get("password").and_then(|v| v.as_str()).unwrap_or(""));
                }
            }
            apply_tls_from_singbox(&mut config, ob);
            config
        }
        "tuic" => {
            let mut config = json!({
                "type": "tuic",
                "uuid": ob.get("uuid")?.as_str()?,
                "password": ob.get("password")?.as_str()?,
                "congestionControl": ob.get("congestion_control").and_then(|v| v.as_str()).unwrap_or("bbr"),
                "udpRelayMode": ob.get("udp_relay_mode").and_then(|v| v.as_str()).unwrap_or("native"),
            });
            apply_tls_from_singbox(&mut config, ob);
            config
        }
        "anytls" => {
            let sni = ob.get("tls")
                .and_then(|v| v.get("server_name"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let idle = ob.get("idle_timeout").and_then(|v| v.as_str())
                .and_then(|s| s.trim_end_matches('s').parse::<i64>().ok())
                .unwrap_or(900);
            json!({
                "type": "anytls",
                "password": ob.get("password")?.as_str()?,
                "sni": sni,
                "idleTimeout": idle,
                "minPaddingLen": ob.get("min_padding_len").and_then(|v| v.as_i64()).unwrap_or(0),
                "maxPaddingLen": ob.get("max_padding_len").and_then(|v| v.as_i64()).unwrap_or(0),
            })
        }
        _ => return None,
    };

    Some(ProxyNode {
        id: Uuid::new_v4().to_string(),
        name: tag.to_string(),
        server: server.to_string(),
        port,
        protocol: ob_type.to_string(),
        country: String::new(),
        country_code: String::new(),
        protocol_config: Some(protocol_config),
    })
}

/// Extract TLS settings from sing-box format into Calamity's internal format.
fn apply_tls_from_singbox(config: &mut Value, ob: &Value) {
    let tls = match ob.get("tls").and_then(|v| v.as_object()) {
        Some(t) => t,
        None => return,
    };

    let enabled = tls.get("enabled").and_then(|v| v.as_bool()).unwrap_or(false);
    if !enabled {
        return;
    }

    let sni = tls.get("server_name").and_then(|v| v.as_str()).unwrap_or("");
    let alpn = tls.get("alpn").and_then(|v| v.as_array())
        .map(|a| a.iter().filter_map(|v| v.as_str().map(String::from)).collect::<Vec<_>>())
        .unwrap_or_default();
    let insecure = tls.get("insecure").and_then(|v| v.as_bool()).unwrap_or(false);

    let mut tls_config = json!({
        "enabled": true,
        "sni": sni,
        "alpn": alpn,
        "insecure": insecure,
        "reality": false,
        "realityPublicKey": "",
        "realityShortId": "",
    });

    if let Some(reality) = tls.get("reality").and_then(|v| v.as_object()) {
        if reality.get("enabled").and_then(|v| v.as_bool()).unwrap_or(false) {
            tls_config["reality"] = json!(true);
            tls_config["realityPublicKey"] = json!(
                reality.get("public_key").and_then(|v| v.as_str()).unwrap_or("")
            );
            tls_config["realityShortId"] = json!(
                reality.get("short_id").and_then(|v| v.as_str()).unwrap_or("")
            );
        }
    }

    config["tls"] = tls_config;
}

/// Extract transport settings from sing-box format into Calamity's internal format.
fn apply_transport_from_singbox(config: &mut Value, ob: &Value) {
    let transport = match ob.get("transport").and_then(|v| v.as_object()) {
        Some(t) => t,
        None => return,
    };

    let t_type = transport.get("type").and_then(|v| v.as_str()).unwrap_or("tcp");

    let mut t_config = json!({ "type": t_type });

    match t_type {
        "ws" => {
            t_config["wsPath"] = json!(
                transport.get("path").and_then(|v| v.as_str()).unwrap_or("/")
            );
            if let Some(headers) = transport.get("headers").and_then(|v| v.as_object()) {
                t_config["wsHeaders"] = json!(headers);
            }
        }
        "grpc" => {
            t_config["grpcServiceName"] = json!(
                transport.get("service_name").and_then(|v| v.as_str()).unwrap_or("")
            );
        }
        "http" => {
            t_config["type"] = json!("h2");
            if let Some(hosts) = transport.get("host").and_then(|v| v.as_array()) {
                t_config["h2Host"] = json!(hosts);
            }
        }
        _ => {}
    }

    config["transport"] = t_config;
}

/// Convert a sing-box route rule to a Calamity RouteRuleConfig.
fn parse_route_rule(rule: &Value, order: usize) -> Option<RouteRuleConfig> {
    // Skip action-only rules (sniff, resolve) that have no match criteria
    let outbound = rule.get("outbound").and_then(|v| v.as_str())?;
    let outbound_normalized = normalize_outbound_name(outbound);

    // Try each known match type
    let (match_type, match_value) = if let Some(v) = rule.get("rule_set").and_then(|v| v.as_str()) {
        // Check if it's a geosite or geoip rule_set tag
        if v.starts_with("geosite-") {
            ("geosite".to_string(), v.strip_prefix("geosite-").unwrap().to_string())
        } else if v.starts_with("geoip-") {
            ("geoip".to_string(), v.strip_prefix("geoip-").unwrap().to_string())
        } else {
            return None; // Unknown rule_set format
        }
    } else if let Some(v) = get_first_string(rule, "domain_suffix") {
        ("domain-suffix".to_string(), v)
    } else if let Some(v) = get_first_string(rule, "domain_keyword") {
        ("domain-keyword".to_string(), v)
    } else if let Some(v) = get_first_string(rule, "domain") {
        ("domain-full".to_string(), v)
    } else if let Some(v) = get_first_string(rule, "domain_regex") {
        ("domain-regex".to_string(), v)
    } else if let Some(v) = get_first_string(rule, "ip_cidr") {
        ("ip-cidr".to_string(), v)
    } else if let Some(v) = get_first_string(rule, "process_name") {
        ("process-name".to_string(), v)
    } else if let Some(v) = get_first_string(rule, "process_path") {
        ("process-path".to_string(), v)
    } else if let Some(v) = rule.get("network").and_then(|v| v.as_str()) {
        ("network".to_string(), v.to_string())
    } else if let Some(v) = get_first_port(rule, "port") {
        ("port".to_string(), v)
    } else {
        return None;
    };

    Some(RouteRuleConfig {
        id: Uuid::new_v4().to_string(),
        name: format!("{}: {}", match_type, match_value),
        enabled: true,
        match_type,
        match_value,
        outbound: outbound_normalized,
        outbound_node: None,
        rule_set_url: None,
        rule_set_local_path: None,
        download_detour: None,
        order,
    })
}

/// Extract first string from a JSON array field, or treat a string field directly.
fn get_first_string(rule: &Value, key: &str) -> Option<String> {
    if let Some(arr) = rule.get(key).and_then(|v| v.as_array()) {
        arr.first().and_then(|v| v.as_str()).map(String::from)
    } else {
        rule.get(key).and_then(|v| v.as_str()).map(String::from)
    }
}

/// Extract port as string from JSON (can be number or array of numbers).
fn get_first_port(rule: &Value, key: &str) -> Option<String> {
    if let Some(arr) = rule.get(key).and_then(|v| v.as_array()) {
        arr.first().and_then(|v| v.as_u64()).map(|p| p.to_string())
    } else {
        rule.get(key).and_then(|v| v.as_u64()).map(|p| p.to_string())
    }
}

/// Map sing-box outbound tag names to Calamity outbound types.
fn normalize_outbound_name(name: &str) -> String {
    match name {
        "direct-out" | "direct" => "direct".to_string(),
        "block-out" | "block" | "reject" => "reject".to_string(),
        _ => "proxy".to_string(),
    }
}

/// Parse a sing-box DNS server config to Calamity format.
fn parse_dns_server(server: &Value) -> Option<DnsServerConfig> {
    let tag = server.get("tag").and_then(|v| v.as_str())?;
    let server_type = server.get("type").and_then(|v| v.as_str()).unwrap_or("udp");

    // Skip fakeip servers (Calamity generates these automatically)
    if server_type == "fakeip" {
        return None;
    }

    let host = server.get("server").and_then(|v| v.as_str()).unwrap_or("");
    let port = server.get("server_port").and_then(|v| v.as_u64()).unwrap_or(0) as u16;

    let address = match server_type {
        "https" => {
            let path = server.get("path").and_then(|v| v.as_str()).unwrap_or("/dns-query");
            if port == 443 {
                format!("https://{}{}", host, path)
            } else {
                format!("https://{}:{}{}", host, port, path)
            }
        }
        "tls" => format!("tls://{}", host),
        _ => host.to_string(), // udp: plain IP
    };

    let detour = server.get("detour").and_then(|v| v.as_str()).map(String::from);
    let domain_resolver = server.get("domain_resolver").and_then(|v| v.as_str()).map(String::from);

    Some(DnsServerConfig {
        id: tag.to_string(),
        name: tag.to_string(),
        address,
        enabled: true,
        detour,
        domain_resolver,
    })
}

/// Parse a sing-box DNS rule to Calamity format.
fn parse_dns_rule(rule: &Value) -> Option<DnsRuleConfig> {
    let server = rule.get("server").and_then(|v| v.as_str())?;

    let (match_type, match_value) = if let Some(v) = get_first_string(rule, "domain") {
        ("domain", v)
    } else if let Some(v) = get_first_string(rule, "domain_suffix") {
        ("domain-suffix", v)
    } else if let Some(v) = get_first_string(rule, "domain_keyword") {
        ("domain-keyword", v)
    } else if let Some(v) = rule.get("rule_set").and_then(|v| v.as_str()) {
        ("rule_set", v.to_string())
    } else {
        return None;
    };

    Some(DnsRuleConfig {
        id: Uuid::new_v4().to_string(),
        match_type: match_type.to_string(),
        match_value,
        server: server.to_string(),
        enabled: true,
    })
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd /Users/linqiankai/calamity/src-tauri && cargo check
```

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/singbox/config_io.rs
git commit -m "feat: implement sing-box native config import"
```

---

### Task 5: Add Tauri commands for import/export

**Files:**
- Create: `src-tauri/src/commands/config_io.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Create the commands file**

Create `src-tauri/src/commands/config_io.rs`:

```rust
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};

use crate::singbox::config_io;
use crate::singbox::process::SingboxProcess;
use crate::singbox::storage;

#[tauri::command]
pub async fn export_config() -> Result<String, String> {
    let backup = config_io::export_backup();
    serde_json::to_string_pretty(&backup).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn import_config(app: AppHandle, content: String) -> Result<config_io::ImportResult, String> {
    let result = config_io::import_config(&content)?;

    // Restart sing-box if running to pick up new config
    let process = app.state::<Arc<SingboxProcess>>().inner().clone();
    if process.is_running().await {
        let settings = storage::load_settings();
        let _ = process.restart(&settings).await;
        let _ = app.emit("singbox-restarted", ());
    }

    // Notify all windows that settings changed
    let _ = app.emit("settings-changed", ());

    Ok(result)
}
```

- [ ] **Step 2: Register the module**

In `src-tauri/src/commands/mod.rs`, add:

```rust
pub mod config_io;
```

- [ ] **Step 3: Register commands in lib.rs**

In `src-tauri/src/lib.rs`, add to the `invoke_handler` list:

```rust
commands::config_io::export_config,
commands::config_io::import_config,
```

- [ ] **Step 4: Verify it compiles**

```bash
cd /Users/linqiankai/calamity/src-tauri && cargo check
```

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/config_io.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs
git commit -m "feat: add Tauri commands for config import/export"
```

---

### Task 6: Add i18n strings

**Files:**
- Modify: `src/i18n/resources.ts`

- [ ] **Step 1: Add English strings**

In the `en.translation.settings` object, add after `logLevels`:

```typescript
exportConfig: "Export Config",
exportConfigDescription: "Export all settings as a backup file",
importConfig: "Import Config",
importConfigDescription: "Import from a backup or sing-box config file",
exporting: "Exporting...",
importing: "Importing...",
importSuccess: "Import successful",
importFailed: "Import failed",
configBackup: "Config Backup",
```

- [ ] **Step 2: Add Chinese strings**

In the `zh-CN.translation.settings` object, add after `logLevels`:

```typescript
exportConfig: "导出配置",
exportConfigDescription: "导出所有设置为备份文件",
importConfig: "导入配置",
importConfigDescription: "从备份文件或 sing-box 配置导入",
exporting: "导出中...",
importing: "导入中...",
importSuccess: "导入成功",
importFailed: "导入失败",
configBackup: "配置备份",
```

- [ ] **Step 3: Commit**

```bash
git add src/i18n/resources.ts
git commit -m "feat: add i18n strings for config import/export"
```

---

### Task 7: Add Import/Export UI to Settings page

**Files:**
- Modify: `src/pages/SettingsPage.tsx`

- [ ] **Step 1: Add import for dialog and new icons**

At the top of `SettingsPage.tsx`, update imports:

```typescript
import { Shield, Check, Download, Upload } from "lucide-react";
```

Add new imports for dialog:

```typescript
import { save, open } from "@tauri-apps/plugin-dialog";
```

Add import for file system (to write export file):

```typescript
import { writeTextFile, readTextFile } from "@tauri-apps/plugin-fs";
```

Note: Also need to install `@tauri-apps/plugin-fs`:

```bash
npm install @tauri-apps/plugin-fs
```

And add to `src-tauri/Cargo.toml`:

```toml
tauri-plugin-fs = "2"
```

And register in `lib.rs`:

```rust
.plugin(tauri_plugin_fs::init())
```

- [ ] **Step 2: Add state and handlers**

Inside the `SettingsPage` component, after the `handleInstallSudoers` function, add:

```typescript
const [importExportStatus, setImportExportStatus] = useState<string | null>(null);

const handleExport = async () => {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const content = await invoke<string>("export_config");

    const filePath = await save({
      defaultPath: `calamity-backup-${new Date().toISOString().slice(0, 10)}.calamity`,
      filters: [{ name: t("settings.configBackup"), extensions: ["calamity"] }],
    });

    if (filePath) {
      await writeTextFile(filePath, content);
      setImportExportStatus(t("settings.exportConfig") + " OK");
      setTimeout(() => setImportExportStatus(null), 3000);
    }
  } catch (e) {
    setImportExportStatus(String(e));
    setTimeout(() => setImportExportStatus(null), 5000);
  }
};

const handleImport = async () => {
  try {
    const filePath = await open({
      filters: [
        { name: t("settings.configBackup"), extensions: ["calamity", "json"] },
      ],
      multiple: false,
    });

    if (!filePath) return;

    const content = await readTextFile(filePath as string);
    const { invoke } = await import("@tauri-apps/api/core");
    const result = await invoke<{
      success: boolean;
      format: string;
      nodesImported: number;
      nodesSkipped: number;
      rulesImported: number;
      dnsServersImported: number;
      message: string;
    }>("import_config", { content });

    setImportExportStatus(result.message);
    // Refresh settings after import
    await fetchSettings();
    setTimeout(() => setImportExportStatus(null), 5000);
  } catch (e) {
    setImportExportStatus(`${t("settings.importFailed")}: ${e}`);
    setTimeout(() => setImportExportStatus(null), 5000);
  }
};
```

- [ ] **Step 3: Add the Config Backup card to the JSX**

After the last `<Card>` (Sing-box Core) and before the closing `</div>`, add:

```tsx
<Card className="animate-slide-up rounded-xl border border-white/[0.06] bg-card/40 backdrop-blur-xl shadow-[0_0_20px_rgba(254,151,185,0.08)] transition-all duration-200 hover:border-white/10 hover:bg-card/80" style={{ animationDelay: "400ms" }}>
  <CardHeader><CardTitle className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{t("settings.configBackup")}</CardTitle></CardHeader>
  <CardContent className="space-y-4">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium">{t("settings.exportConfig")}</p>
        <p className="text-xs text-muted-foreground">{t("settings.exportConfigDescription")}</p>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="border-white/[0.06]"
        onClick={handleExport}
      >
        <Download className="h-3.5 w-3.5 mr-1.5" />
        {t("settings.exportConfig")}
      </Button>
    </div>
    <Separator className="bg-white/[0.04]" />
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium">{t("settings.importConfig")}</p>
        <p className="text-xs text-muted-foreground">{t("settings.importConfigDescription")}</p>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="border-white/[0.06]"
        onClick={handleImport}
      >
        <Upload className="h-3.5 w-3.5 mr-1.5" />
        {t("settings.importConfig")}
      </Button>
    </div>
    {importExportStatus && (
      <p className="text-xs text-muted-foreground bg-muted/20 rounded-lg px-3 py-2">{importExportStatus}</p>
    )}
  </CardContent>
</Card>
```

- [ ] **Step 4: Verify frontend compiles**

```bash
cd /Users/linqiankai/calamity && npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/pages/SettingsPage.tsx src-tauri/Cargo.toml package.json package-lock.json src-tauri/src/lib.rs
git commit -m "feat: add config import/export UI to Settings page"
```

---

### Task 8: Add tests for config import/export

**Files:**
- Modify: `src-tauri/src/singbox/config_io.rs`

- [ ] **Step 1: Add unit tests at the bottom of config_io.rs**

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn detects_calamity_backup_format() {
        let backup = json!({
            "version": 1,
            "exportedAt": "2026-03-30T00:00:00Z",
            "settings": {},
            "nodes": { "groups": [], "activeNode": null },
            "rules": { "rules": [], "finalOutbound": "proxy", "updateInterval": 86400 },
            "dns": { "mode": "redir-host", "fakeIpRange": "198.18.0.0/15", "finalServer": "dns-direct", "servers": [], "rules": [] },
            "subscriptions": { "subscriptions": [] }
        });

        let result = import_config(&serde_json::to_string(&backup).unwrap());
        assert!(result.is_ok());
        let r = result.unwrap();
        assert_eq!(r.format, "calamity");
    }

    #[test]
    fn detects_singbox_native_format() {
        let config = json!({
            "outbounds": [
                {
                    "type": "vmess",
                    "tag": "test-node",
                    "server": "1.2.3.4",
                    "server_port": 443,
                    "uuid": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
                    "alter_id": 0,
                    "security": "auto"
                },
                { "type": "direct", "tag": "direct-out" }
            ],
            "inbounds": [
                { "type": "mixed", "listen": "127.0.0.1", "listen_port": 7890 }
            ],
            "route": {
                "final": "direct-out",
                "rules": []
            }
        });

        let result = import_config(&serde_json::to_string(&config).unwrap());
        assert!(result.is_ok());
        let r = result.unwrap();
        assert_eq!(r.format, "singbox");
        assert_eq!(r.nodes_imported, 1);
        assert_eq!(r.nodes_skipped, 0);
    }

    #[test]
    fn skips_unsupported_protocols() {
        let config = json!({
            "outbounds": [
                {
                    "type": "vmess",
                    "tag": "supported",
                    "server": "1.2.3.4",
                    "server_port": 443,
                    "uuid": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
                },
                {
                    "type": "wireguard",
                    "tag": "unsupported",
                    "server": "5.6.7.8",
                    "server_port": 51820
                },
                { "type": "direct", "tag": "direct-out" }
            ]
        });

        let result = import_config(&serde_json::to_string(&config).unwrap());
        assert!(result.is_ok());
        let r = result.unwrap();
        assert_eq!(r.nodes_imported, 1);
        assert_eq!(r.nodes_skipped, 1);
    }

    #[test]
    fn rejects_unknown_format() {
        let result = import_config(r#"{"foo": "bar"}"#);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Unknown config format"));
    }

    #[test]
    fn rejects_invalid_json() {
        let result = import_config("not json at all");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Invalid JSON"));
    }

    #[test]
    fn parses_vmess_with_tls_and_ws() {
        let ob = json!({
            "type": "vmess",
            "tag": "my-vmess",
            "server": "example.com",
            "server_port": 443,
            "uuid": "test-uuid",
            "alter_id": 0,
            "security": "auto",
            "tls": {
                "enabled": true,
                "server_name": "example.com",
                "alpn": ["h2", "http/1.1"]
            },
            "transport": {
                "type": "ws",
                "path": "/ws",
                "headers": { "Host": "example.com" }
            }
        });

        let node = parse_outbound_to_node(&ob).expect("should parse vmess");
        assert_eq!(node.name, "my-vmess");
        assert_eq!(node.server, "example.com");
        assert_eq!(node.port, 443);
        assert_eq!(node.protocol, "vmess");

        let config = node.protocol_config.unwrap();
        assert_eq!(config["type"], "vmess");
        assert_eq!(config["uuid"], "test-uuid");
        assert_eq!(config["tls"]["enabled"], true);
        assert_eq!(config["tls"]["sni"], "example.com");
        assert_eq!(config["transport"]["type"], "ws");
        assert_eq!(config["transport"]["wsPath"], "/ws");
    }

    #[test]
    fn parses_route_rules() {
        let rule = json!({
            "domain_suffix": [".example.com"],
            "action": "route",
            "outbound": "direct-out"
        });

        let parsed = parse_route_rule(&rule, 0).expect("should parse rule");
        assert_eq!(parsed.match_type, "domain-suffix");
        assert_eq!(parsed.match_value, ".example.com");
        assert_eq!(parsed.outbound, "direct");
    }

    #[test]
    fn parses_geosite_rule_set() {
        let rule = json!({
            "rule_set": "geosite-cn",
            "action": "route",
            "outbound": "direct-out"
        });

        let parsed = parse_route_rule(&rule, 0).expect("should parse geosite rule");
        assert_eq!(parsed.match_type, "geosite");
        assert_eq!(parsed.match_value, "cn");
    }

    #[test]
    fn parses_dns_servers() {
        let https_server = json!({
            "type": "https",
            "tag": "dns-google",
            "server": "dns.google",
            "server_port": 443,
            "path": "/dns-query",
            "domain_resolver": "dns-bootstrap"
        });

        let parsed = parse_dns_server(&https_server).expect("should parse HTTPS DNS");
        assert_eq!(parsed.id, "dns-google");
        assert_eq!(parsed.address, "https://dns.google/dns-query");
        assert_eq!(parsed.domain_resolver, Some("dns-bootstrap".to_string()));
    }

    #[test]
    fn normalizes_outbound_names() {
        assert_eq!(normalize_outbound_name("direct-out"), "direct");
        assert_eq!(normalize_outbound_name("direct"), "direct");
        assert_eq!(normalize_outbound_name("block-out"), "reject");
        assert_eq!(normalize_outbound_name("my-proxy"), "proxy");
    }
}
```

- [ ] **Step 2: Run the tests**

```bash
cd /Users/linqiankai/calamity/src-tauri && cargo test --lib singbox::config_io::tests
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/singbox/config_io.rs
git commit -m "test: add unit tests for config import/export"
```

---

### Task 9: Register fs plugin and final integration test

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add tauri-plugin-fs to Cargo.toml (if not done in Task 7)**

```toml
tauri-plugin-fs = "2"
```

- [ ] **Step 2: Register in lib.rs (if not done in Task 7)**

```rust
.plugin(tauri_plugin_fs::init())
```

- [ ] **Step 3: Run full cargo check**

```bash
cd /Users/linqiankai/calamity/src-tauri && cargo check
```

- [ ] **Step 4: Run full test suite**

```bash
cd /Users/linqiankai/calamity/src-tauri && cargo test
```

- [ ] **Step 5: Run dev build**

```bash
cd /Users/linqiankai/calamity && npm run tauri dev
```

Verify: Settings page shows "Config Backup" card with Export and Import buttons. Export saves a `.calamity` file. Import loads it back.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: complete config import/export with file dialog support"
```
