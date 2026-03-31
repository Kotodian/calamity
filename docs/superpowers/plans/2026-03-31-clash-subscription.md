# Clash Subscription Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Parse Clash YAML subscriptions into ProxyNode + RouteRuleConfig, with auto-format detection.

**Architecture:** Add `serde_yaml` crate. New `clash_parse.rs` module handles YAML→ProxyNode and YAML→RouteRuleConfig conversion. `fetch_subscription` auto-detects format by checking for `proxies:` in response body. `FetchResult` gains optional `rules` and `final_outbound` fields. `update_subscription` command merges imported rules into `rules.json`.

**Tech Stack:** Rust, serde_yaml, serde_json

---

### Task 1: Add serde_yaml dependency and create clash_parse module skeleton

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/singbox/clash_parse.rs`
- Modify: `src-tauri/src/singbox/mod.rs`

- [ ] **Step 1: Add serde_yaml to Cargo.toml**

In `src-tauri/Cargo.toml`, add under `[dependencies]`:
```toml
serde_yaml = "0.9"
```

- [ ] **Step 2: Create clash_parse.rs with struct and stub function**

```rust
use serde_json::{json, Value};

use super::nodes_storage::ProxyNode;
use super::rules_storage::RouteRuleConfig;
use super::subscription_fetch::infer_country;

pub struct ClashParseResult {
    pub nodes: Vec<ProxyNode>,
    pub rules: Vec<RouteRuleConfig>,
    pub final_outbound: Option<String>,
}

/// Returns true if the body looks like a Clash YAML subscription.
pub fn is_clash_yaml(body: &str) -> bool {
    body.contains("proxies:") || body.contains("Proxy:")
}

/// Parse a Clash YAML subscription body into nodes and rules.
pub fn parse_clash_yaml(body: &str) -> Result<ClashParseResult, String> {
    let yaml: Value = serde_yaml::from_str(body).map_err(|e| format!("invalid YAML: {}", e))?;

    let nodes = parse_proxies(&yaml);
    let (rules, final_outbound) = parse_rules(&yaml);

    Ok(ClashParseResult {
        nodes,
        rules,
        final_outbound,
    })
}

fn parse_proxies(_yaml: &Value) -> Vec<ProxyNode> {
    vec![]
}

fn parse_rules(_yaml: &Value) -> (Vec<RouteRuleConfig>, Option<String>) {
    (vec![], None)
}
```

- [ ] **Step 3: Register module in mod.rs**

Add to `src-tauri/src/singbox/mod.rs`:
```rust
pub mod clash_parse;
```

- [ ] **Step 4: Make infer_country public in subscription_fetch.rs**

Change `fn infer_country(` to `pub fn infer_country(` in `src-tauri/src/singbox/subscription_fetch.rs`.

- [ ] **Step 5: Verify compilation**

Run: `cargo check`
Expected: Compiles with warnings only.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/src/singbox/clash_parse.rs src-tauri/src/singbox/mod.rs src-tauri/src/singbox/subscription_fetch.rs
git commit -m "feat: add clash_parse module skeleton and serde_yaml dep"
```

---

### Task 2: Implement Clash proxy node parsing with tests

**Files:**
- Modify: `src-tauri/src/singbox/clash_parse.rs`

- [ ] **Step 1: Write tests for proxy parsing**

Add to bottom of `clash_parse.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_clash_ss_node() {
        let yaml = r#"
proxies:
  - name: "SS Tokyo"
    type: ss
    server: 1.2.3.4
    port: 8388
    cipher: aes-256-gcm
    password: "secret"
"#;
        let result = parse_clash_yaml(yaml).unwrap();
        assert_eq!(result.nodes.len(), 1);
        let node = &result.nodes[0];
        assert_eq!(node.name, "SS Tokyo");
        assert_eq!(node.server, "1.2.3.4");
        assert_eq!(node.port, 8388);
        assert_eq!(node.protocol, "Shadowsocks");
        let cfg = node.protocol_config.as_ref().unwrap();
        assert_eq!(cfg["type"], "shadowsocks");
        assert_eq!(cfg["method"], "aes-256-gcm");
        assert_eq!(cfg["password"], "secret");
    }

    #[test]
    fn parse_clash_vmess_node() {
        let yaml = r#"
proxies:
  - name: "VMess HK"
    type: vmess
    server: hk.example.com
    port: 443
    uuid: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
    alterId: 0
    cipher: auto
    tls: true
    servername: hk.example.com
    network: ws
    ws-opts:
      path: /ws
      headers:
        Host: hk.example.com
"#;
        let result = parse_clash_yaml(yaml).unwrap();
        assert_eq!(result.nodes.len(), 1);
        let node = &result.nodes[0];
        assert_eq!(node.protocol, "VMess");
        assert_eq!(node.country_code, "HK");
        let cfg = node.protocol_config.as_ref().unwrap();
        assert_eq!(cfg["uuid"], "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
        assert_eq!(cfg["tls"]["enabled"], true);
        assert_eq!(cfg["transport"]["type"], "ws");
    }

    #[test]
    fn parse_clash_trojan_node() {
        let yaml = r#"
proxies:
  - name: "Trojan SG"
    type: trojan
    server: sg.example.com
    port: 443
    password: "trojan-pass"
    sni: sg.example.com
"#;
        let result = parse_clash_yaml(yaml).unwrap();
        assert_eq!(result.nodes.len(), 1);
        let node = &result.nodes[0];
        assert_eq!(node.protocol, "Trojan");
        let cfg = node.protocol_config.as_ref().unwrap();
        assert_eq!(cfg["password"], "trojan-pass");
        assert_eq!(cfg["tls"]["sni"], "sg.example.com");
    }

    #[test]
    fn parse_clash_vless_node() {
        let yaml = r#"
proxies:
  - name: "VLESS US"
    type: vless
    server: us.example.com
    port: 443
    uuid: "11111111-2222-3333-4444-555555555555"
    flow: xtls-rprx-vision
    tls: true
    servername: us.example.com
"#;
        let result = parse_clash_yaml(yaml).unwrap();
        assert_eq!(result.nodes.len(), 1);
        let node = &result.nodes[0];
        assert_eq!(node.protocol, "VLESS");
        let cfg = node.protocol_config.as_ref().unwrap();
        assert_eq!(cfg["flow"], "xtls-rprx-vision");
    }

    #[test]
    fn parse_clash_hysteria2_node() {
        let yaml = r#"
proxies:
  - name: "Hy2 JP"
    type: hysteria2
    server: jp.example.com
    port: 443
    password: "hy2-pass"
    sni: jp.example.com
"#;
        let result = parse_clash_yaml(yaml).unwrap();
        assert_eq!(result.nodes.len(), 1);
        let node = &result.nodes[0];
        assert_eq!(node.protocol, "Hysteria2");
    }

    #[test]
    fn parse_clash_skips_unsupported_protocol() {
        let yaml = r#"
proxies:
  - name: "Snell Node"
    type: snell
    server: 1.2.3.4
    port: 1234
    psk: "key"
  - name: "SS Node"
    type: ss
    server: 5.6.7.8
    port: 8388
    cipher: aes-256-gcm
    password: "pass"
"#;
        let result = parse_clash_yaml(yaml).unwrap();
        assert_eq!(result.nodes.len(), 1);
        assert_eq!(result.nodes[0].name, "SS Node");
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test --lib clash_parse`
Expected: FAIL — `parse_proxies` returns empty vec.

- [ ] **Step 3: Implement parse_proxies and per-protocol parsers**

Replace the `parse_proxies` stub and add protocol-specific functions:

```rust
fn parse_proxies(yaml: &Value) -> Vec<ProxyNode> {
    let proxies = yaml.get("proxies").and_then(|v| v.as_sequence());
    let Some(proxies) = proxies else {
        return vec![];
    };

    proxies.iter().filter_map(parse_clash_proxy).collect()
}

fn parse_clash_proxy(proxy: &Value) -> Option<ProxyNode> {
    let proxy_type = proxy.get("type")?.as_str()?;
    let name = proxy.get("name")?.as_str()?.to_string();
    let server = proxy.get("server")?.as_str()?.to_string();
    let port = proxy.get("port")?.as_u64()? as u16;
    let (country, country_code) = infer_country(&name);

    let (protocol, config) = match proxy_type {
        "ss" => ("Shadowsocks", build_clash_ss(proxy)),
        "vmess" => ("VMess", build_clash_vmess(proxy)),
        "vless" => ("VLESS", build_clash_vless(proxy)),
        "trojan" => ("Trojan", build_clash_trojan(proxy)),
        "hysteria2" => ("Hysteria2", build_clash_hysteria2(proxy)),
        "tuic" => ("TUIC", build_clash_tuic(proxy)),
        _ => return None,
    };

    Some(ProxyNode {
        id: name.clone(),
        name,
        server,
        port,
        protocol: protocol.to_string(),
        country,
        country_code,
        protocol_config: Some(config),
    })
}

fn clash_tls_config(proxy: &Value) -> Value {
    let tls_enabled = proxy.get("tls").and_then(|v| v.as_bool()).unwrap_or(false);
    let sni = proxy
        .get("servername")
        .or_else(|| proxy.get("sni"))
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let insecure = proxy
        .get("skip-cert-verify")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let alpn = proxy
        .get("alpn")
        .and_then(|v| v.as_sequence())
        .map(|seq| seq.iter().filter_map(|v| v.as_str()).collect::<Vec<_>>())
        .unwrap_or_default();

    json!({
        "enabled": tls_enabled,
        "sni": sni,
        "alpn": alpn,
        "insecure": insecure,
        "reality": false,
        "realityPublicKey": "",
        "realityShortId": "",
    })
}

fn clash_transport_config(proxy: &Value) -> Value {
    let network = proxy
        .get("network")
        .and_then(|v| v.as_str())
        .unwrap_or("tcp");
    json!({ "type": network })
}

fn build_clash_ss(proxy: &Value) -> Value {
    json!({
        "type": "shadowsocks",
        "method": proxy.get("cipher").and_then(|v| v.as_str()).unwrap_or("aes-256-gcm"),
        "password": proxy.get("password").and_then(|v| v.as_str()).unwrap_or(""),
    })
}

fn build_clash_vmess(proxy: &Value) -> Value {
    json!({
        "type": "vmess",
        "uuid": proxy.get("uuid").and_then(|v| v.as_str()).unwrap_or(""),
        "alterId": proxy.get("alterId").and_then(|v| v.as_u64()).unwrap_or(0),
        "security": proxy.get("cipher").and_then(|v| v.as_str()).unwrap_or("auto"),
        "transport": clash_transport_config(proxy),
        "tls": clash_tls_config(proxy),
    })
}

fn build_clash_vless(proxy: &Value) -> Value {
    json!({
        "type": "vless",
        "uuid": proxy.get("uuid").and_then(|v| v.as_str()).unwrap_or(""),
        "flow": proxy.get("flow").and_then(|v| v.as_str()).unwrap_or(""),
        "transport": clash_transport_config(proxy),
        "tls": clash_tls_config(proxy),
    })
}

fn build_clash_trojan(proxy: &Value) -> Value {
    let mut tls = clash_tls_config(proxy);
    // Trojan always has TLS enabled
    tls["enabled"] = json!(true);
    json!({
        "type": "trojan",
        "password": proxy.get("password").and_then(|v| v.as_str()).unwrap_or(""),
        "transport": clash_transport_config(proxy),
        "tls": tls,
    })
}

fn build_clash_hysteria2(proxy: &Value) -> Value {
    let mut tls = clash_tls_config(proxy);
    tls["enabled"] = json!(true);
    json!({
        "type": "hysteria2",
        "password": proxy.get("password").and_then(|v| v.as_str()).unwrap_or(""),
        "upMbps": proxy.get("up").and_then(|v| v.as_u64()).unwrap_or(100),
        "downMbps": proxy.get("down").and_then(|v| v.as_u64()).unwrap_or(200),
        "obfsType": proxy.get("obfs").and_then(|v| v.as_str()).unwrap_or(""),
        "obfsPassword": proxy.get("obfs-password").and_then(|v| v.as_str()).unwrap_or(""),
        "tls": tls,
    })
}

fn build_clash_tuic(proxy: &Value) -> Value {
    let mut tls = clash_tls_config(proxy);
    tls["enabled"] = json!(true);
    json!({
        "type": "tuic",
        "uuid": proxy.get("uuid").and_then(|v| v.as_str()).unwrap_or(""),
        "password": proxy.get("password").and_then(|v| v.as_str()).unwrap_or(""),
        "congestionControl": proxy.get("congestion-controller").and_then(|v| v.as_str()).unwrap_or("bbr"),
        "udpRelayMode": proxy.get("udp-relay-mode").and_then(|v| v.as_str()).unwrap_or("native"),
        "tls": tls,
    })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test --lib clash_parse`
Expected: All 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/singbox/clash_parse.rs
git commit -m "feat: implement Clash proxy node parsing for 6 protocols"
```

---

### Task 3: Implement Clash rule parsing with tests

**Files:**
- Modify: `src-tauri/src/singbox/clash_parse.rs`

- [ ] **Step 1: Write tests for rule parsing**

Add to the `tests` module:

```rust
    #[test]
    fn parse_clash_rules() {
        let yaml = r#"
proxies:
  - name: "SS Node"
    type: ss
    server: 1.2.3.4
    port: 8388
    cipher: aes-256-gcm
    password: "pass"

rules:
  - DOMAIN-SUFFIX,google.com,Proxy
  - DOMAIN-KEYWORD,youtube,Proxy
  - DOMAIN,example.com,DIRECT
  - GEOIP,CN,DIRECT
  - GEOSITE,cn,DIRECT
  - IP-CIDR,192.168.0.0/16,DIRECT
  - MATCH,Proxy
"#;
        let result = parse_clash_yaml(yaml).unwrap();
        assert_eq!(result.rules.len(), 6); // MATCH becomes final_outbound, not a rule
        assert_eq!(result.final_outbound, Some("proxy".to_string()));

        assert_eq!(result.rules[0].match_type, "domain-suffix");
        assert_eq!(result.rules[0].match_value, "google.com");
        assert_eq!(result.rules[0].outbound, "proxy");

        assert_eq!(result.rules[1].match_type, "domain-keyword");
        assert_eq!(result.rules[2].match_type, "domain-full");
        assert_eq!(result.rules[2].outbound, "direct");

        assert_eq!(result.rules[3].match_type, "geoip");
        assert_eq!(result.rules[3].match_value, "cn");

        assert_eq!(result.rules[4].match_type, "geosite");
        assert_eq!(result.rules[5].match_type, "ip-cidr");
    }

    #[test]
    fn parse_clash_rules_maps_reject() {
        let yaml = r#"
proxies: []
rules:
  - DOMAIN,ads.com,REJECT
"#;
        let result = parse_clash_yaml(yaml).unwrap();
        assert_eq!(result.rules[0].outbound, "reject");
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test --lib clash_parse::tests::parse_clash_rules`
Expected: FAIL — `parse_rules` returns empty.

- [ ] **Step 3: Implement parse_rules**

Replace the `parse_rules` stub:

```rust
fn parse_rules(yaml: &Value) -> (Vec<RouteRuleConfig>, Option<String>) {
    let rules_arr = yaml.get("rules").and_then(|v| v.as_sequence());
    let Some(rules_arr) = rules_arr else {
        return (vec![], None);
    };

    let mut rules = Vec::new();
    let mut final_outbound = None;

    for (i, entry) in rules_arr.iter().enumerate() {
        let line = match entry.as_str() {
            Some(s) => s,
            None => continue,
        };

        let parts: Vec<&str> = line.splitn(3, ',').collect();
        if parts.len() < 2 {
            continue;
        }

        let clash_type = parts[0].trim();

        // MATCH only has 2 parts: MATCH,outbound
        if clash_type == "MATCH" {
            final_outbound = Some(map_clash_outbound(parts[1].trim()));
            continue;
        }

        if parts.len() < 3 {
            continue;
        }

        let value = parts[1].trim();
        let outbound_raw = parts[2].trim();

        let match_type = match clash_type {
            "DOMAIN-SUFFIX" => "domain-suffix",
            "DOMAIN-KEYWORD" => "domain-keyword",
            "DOMAIN" => "domain-full",
            "GEOIP" => "geoip",
            "GEOSITE" => "geosite",
            "IP-CIDR" | "IP-CIDR6" => "ip-cidr",
            _ => continue,
        };

        // Normalize geoip/geosite values to lowercase
        let match_value = if match_type == "geoip" || match_type == "geosite" {
            value.to_lowercase()
        } else {
            value.to_string()
        };

        rules.push(RouteRuleConfig {
            id: format!("clash-rule-{}", i),
            name: format!("{} {}", clash_type, value),
            enabled: true,
            match_type: match_type.to_string(),
            match_value,
            outbound: map_clash_outbound(outbound_raw),
            outbound_node: None,
            rule_set_url: None,
            rule_set_local_path: None,
            download_detour: None,
            order: i,
        });
    }

    (rules, final_outbound)
}

fn map_clash_outbound(name: &str) -> String {
    match name.to_uppercase().as_str() {
        "DIRECT" => "direct".to_string(),
        "REJECT" => "reject".to_string(),
        _ => "proxy".to_string(),
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test --lib clash_parse`
Expected: All 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/singbox/clash_parse.rs
git commit -m "feat: implement Clash rule parsing with outbound mapping"
```

---

### Task 4: Extend FetchResult and integrate auto-detection in fetch_subscription

**Files:**
- Modify: `src-tauri/src/singbox/subscription_fetch.rs`

- [ ] **Step 1: Extend FetchResult with rules fields**

```rust
#[derive(Debug, Clone)]
pub struct FetchResult {
    pub nodes: Vec<ProxyNode>,
    pub user_info: Option<SubscriptionUserInfo>,
    pub rules: Vec<super::rules_storage::RouteRuleConfig>,
    pub final_outbound: Option<String>,
}
```

- [ ] **Step 2: Update fetch_subscription with auto-detection**

Replace the parsing section at the end of `fetch_subscription` (after `let body = ...`):

```rust
    // Auto-detect format: Clash YAML or base64 URI list
    if super::clash_parse::is_clash_yaml(&body) {
        let clash_result =
            super::clash_parse::parse_clash_yaml(&body).map_err(|e| format!("Clash parse error: {}", e))?;
        return Ok(FetchResult {
            nodes: clash_result.nodes,
            user_info,
            rules: clash_result.rules,
            final_outbound: clash_result.final_outbound,
        });
    }

    // Try base64 decode first, fall back to raw text
    let decoded = base64::engine::general_purpose::STANDARD
        .decode(body.trim())
        .or_else(|_| base64::engine::general_purpose::STANDARD_NO_PAD.decode(body.trim()))
        .and_then(|b| String::from_utf8(b).map_err(|_| base64::DecodeError::InvalidByte(0, 0)))
        .unwrap_or_else(|_| body.clone());

    let nodes: Vec<ProxyNode> = decoded.lines().filter_map(parse_v2ray_uri).collect();

    Ok(FetchResult {
        nodes,
        user_info,
        rules: vec![],
        final_outbound: None,
    })
```

- [ ] **Step 3: Verify compilation**

Run: `cargo check`
Expected: Compiles (may have warnings in commands/subscriptions.rs about unused fields — that's fine, fixed in next task).

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/singbox/subscription_fetch.rs
git commit -m "feat: auto-detect Clash YAML format in fetch_subscription"
```

---

### Task 5: Merge imported rules in update_subscription command

**Files:**
- Modify: `src-tauri/src/commands/subscriptions.rs`

- [ ] **Step 1: Add rule merging to add_subscription**

In `add_subscription`, after `nodes_storage::save_nodes(&nodes_data)?;`, add:

```rust
        // Import rules from Clash subscriptions (append, deduplicate by match_type+match_value)
        if !result.rules.is_empty() {
            let mut rules_data = rules_storage::load_rules();
            let existing_keys: std::collections::HashSet<String> = rules_data
                .rules
                .iter()
                .map(|r| format!("{}:{}", r.match_type, r.match_value))
                .collect();
            let base_order = rules_data.rules.len();
            for (i, mut rule) in result.rules.into_iter().enumerate() {
                let key = format!("{}:{}", rule.match_type, rule.match_value);
                if !existing_keys.contains(&key) {
                    rule.order = base_order + i;
                    rule.id = format!("sub-rule-{}", uuid::Uuid::new_v4());
                    rules_data.rules.push(rule);
                }
            }
            if let Some(final_ob) = result.final_outbound {
                rules_data.final_outbound = final_ob;
            }
            rules_storage::save_rules(&rules_data)?;
        }
```

- [ ] **Step 2: Add same rule merging to update_subscription**

In `update_subscription`, after `nodes_storage::save_nodes(&nodes_data)?;`, add the same rule merging block (copy from step 1).

- [ ] **Step 3: Add missing import**

At the top of `src-tauri/src/commands/subscriptions.rs`, ensure:
```rust
use crate::singbox::rules_storage;
```

- [ ] **Step 4: Verify compilation and tests**

Run: `cargo check && cargo test --lib`
Expected: Compiles and all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/subscriptions.rs
git commit -m "feat: merge Clash subscription rules into rules.json on import"
```

---

### Task 6: Add is_clash_yaml test and integration test

**Files:**
- Modify: `src-tauri/src/singbox/clash_parse.rs`

- [ ] **Step 1: Add detection and full integration tests**

Add to `tests` module:

```rust
    #[test]
    fn is_clash_yaml_detects_proxies_keyword() {
        assert!(is_clash_yaml("proxies:\n  - name: test"));
        assert!(is_clash_yaml("mixed-port: 7890\nproxies:\n"));
        assert!(!is_clash_yaml("dm1lc3M6Ly8="));
        assert!(!is_clash_yaml("ss://YWVz"));
    }

    #[test]
    fn full_clash_subscription_integration() {
        let yaml = r#"
mixed-port: 7890
proxies:
  - name: "HK SS"
    type: ss
    server: hk1.example.com
    port: 8388
    cipher: chacha20-ietf-poly1305
    password: "pwd1"
  - name: "JP VMess"
    type: vmess
    server: jp1.example.com
    port: 443
    uuid: "aaaa-bbbb"
    alterId: 0
    cipher: auto
    tls: true
    servername: jp1.example.com
  - name: "Snell Unsupported"
    type: snell
    server: 1.2.3.4
    port: 1234
    psk: "key"

proxy-groups:
  - name: Proxy
    type: select
    proxies:
      - "HK SS"
      - "JP VMess"

rules:
  - GEOSITE,cn,DIRECT
  - GEOIP,CN,DIRECT
  - MATCH,Proxy
"#;
        let result = parse_clash_yaml(yaml).unwrap();
        // 2 nodes (snell skipped)
        assert_eq!(result.nodes.len(), 2);
        assert_eq!(result.nodes[0].name, "HK SS");
        assert_eq!(result.nodes[1].name, "JP VMess");
        // 2 rules + final_outbound
        assert_eq!(result.rules.len(), 2);
        assert_eq!(result.final_outbound, Some("proxy".to_string()));
    }
```

- [ ] **Step 2: Run all tests**

Run: `cargo test --lib clash_parse`
Expected: All 10 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/singbox/clash_parse.rs
git commit -m "test: add Clash format detection and integration tests"
```

---

Plan complete and saved to `docs/superpowers/plans/2026-03-31-clash-subscription.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?