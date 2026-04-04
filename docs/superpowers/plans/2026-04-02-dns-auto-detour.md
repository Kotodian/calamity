# DNS Auto-Detour Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-generate DNS servers and rules from route rules so that DNS resolution for each domain uses the same proxy node as its traffic routing.

**Architecture:** In `config.rs`, after building route rules, scan for domain-based rules with proxy outbounds. For each unique outbound, create a DNS server cloned from the user's proxy DNS (e.g. `https://1.1.1.1/dns-query`) with that outbound as `detour`. Then append DNS rules matching the route rule's domain match. Manual DNS rules take priority (auto-generated rules are appended after).

**Tech Stack:** Rust (sing-box config generation)

---

### Task 1: Extract domain-based route rules into auto DNS entries

**Files:**
- Modify: `src-tauri/src/singbox/config.rs` — add `build_auto_dns_entries` function, modify `build_dns_section` signature and `generate_config` call

- [ ] **Step 1: Write the failing test**

Add to `src-tauri/src/singbox/config.rs` `mod tests`:

```rust
#[test]
fn auto_dns_generates_server_and_rule_for_proxy_geosite_rule() {
    let dns = DnsSettings::default();
    let rules_data = rules_storage::RulesData {
        rules: vec![rules_storage::RouteRuleConfig {
            id: "rule-ai".to_string(),
            name: "AI Sites".to_string(),
            enabled: true,
            match_type: "geosite".to_string(),
            match_value: "Ai".to_string(),
            outbound: "proxy".to_string(),
            outbound_node: Some("US-Node".to_string()),
            rule_set_url: None,
            rule_set_local_path: None,
            download_detour: None,
            invert: false,
            order: 0,
        }],
        final_outbound: "proxy".to_string(),
        final_outbound_node: None,
        update_interval: 86400,
    };
    let all_node_tags = vec!["US-Node".to_string()];

    let (auto_servers, auto_rules) = build_auto_dns_entries(
        &dns,
        &rules_data,
        &all_node_tags,
        None,
    );

    // Should generate a DNS server with detour=US-Node
    assert_eq!(auto_servers.len(), 1);
    assert_eq!(auto_servers[0]["detour"], "US-Node");
    assert!(auto_servers[0]["tag"].as_str().unwrap().starts_with("dns-auto-"));

    // Should generate a DNS rule for geosite-Ai → that server
    assert_eq!(auto_rules.len(), 1);
    assert_eq!(auto_rules[0]["rule_set"], "geosite-Ai");
    assert_eq!(auto_rules[0]["server"], auto_servers[0]["tag"]);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src-tauri && cargo test auto_dns_generates -- --nocapture`
Expected: FAIL — `build_auto_dns_entries` not found

- [ ] **Step 3: Write `build_auto_dns_entries` function**

Add to `src-tauri/src/singbox/config.rs`, before `build_pre_match_route_rules`:

```rust
/// Domain-based match types that should auto-generate DNS rules.
const DNS_DOMAIN_MATCH_TYPES: &[&str] = &[
    "geosite", "domain-suffix", "domain-keyword", "domain-full", "domain-regex", "rule-set",
];

/// Build auto-generated DNS servers and rules from route rules.
/// For each domain-based route rule that goes through a proxy outbound,
/// create a DNS server with the same detour and a matching DNS rule.
/// Skips rules that already have a manual DNS rule (same match_value).
fn build_auto_dns_entries(
    dns: &DnsSettings,
    rules_data: &rules_storage::RulesData,
    all_node_tags: &[String],
    active_node: Option<&str>,
) -> (Vec<Value>, Vec<Value>) {
    // Find the proxy DNS server to clone address from
    let proxy_dns_base = dns
        .servers
        .iter()
        .find(|s| s.enabled && s.address.starts_with("https://"))
        .or_else(|| dns.servers.iter().find(|s| s.enabled && s.address.starts_with("tls://")))
        .map(|s| s.address.clone())
        .unwrap_or_else(|| "https://1.1.1.1/dns-query".to_string());

    // Collect existing manual DNS rule match values for dedup
    let manual_dns_keys: std::collections::HashSet<String> = dns
        .rules
        .iter()
        .filter(|r| r.enabled)
        .map(|r| r.match_value.clone())
        .collect();

    let mut auto_servers: Vec<Value> = Vec::new();
    let mut auto_rules: Vec<Value> = Vec::new();
    // Track which outbound tags already have a DNS server
    let mut outbound_to_dns_tag: std::collections::HashMap<String, String> =
        std::collections::HashMap::new();

    for rule in &rules_data.rules {
        if !rule.enabled {
            continue;
        }

        // Only domain-based match types need DNS rules
        if !DNS_DOMAIN_MATCH_TYPES.contains(&rule.match_type.as_str()) {
            continue;
        }

        // Only proxy outbounds need a detour; direct/reject don't
        if rule.outbound == "direct" || rule.outbound == "reject" || rule.outbound == "tailnet" {
            continue;
        }

        let outbound_tag =
            resolve_outbound(&rule.outbound, &rule.outbound_node, all_node_tags, active_node);

        // Skip if outbound resolved to direct
        if outbound_tag == "direct-out" || outbound_tag == "block-out" {
            continue;
        }

        // Build the DNS rule match key to check for manual duplicates
        let dns_match_value = match rule.match_type.as_str() {
            "geosite" => format!("geosite-{}", rule.match_value),
            "rule-set" => rule.match_value.clone(),
            _ => rule.match_value.clone(),
        };

        // Skip if user already has a manual DNS rule for this
        if manual_dns_keys.contains(&dns_match_value) || manual_dns_keys.contains(&rule.match_value) {
            continue;
        }

        // Get or create DNS server for this outbound
        let dns_server_tag = outbound_to_dns_tag
            .entry(outbound_tag.clone())
            .or_insert_with(|| {
                let tag = format!("dns-auto-{}", outbound_tag);
                auto_servers.push(build_auto_dns_server(&proxy_dns_base, &tag, &outbound_tag));
                tag
            })
            .clone();

        // Build DNS rule matching the route rule's domain match
        let dns_rule = match rule.match_type.as_str() {
            "geosite" => {
                let rule_set_tag = format!("geosite-{}", rule.match_value);
                json!({ "rule_set": rule_set_tag, "server": dns_server_tag })
            }
            "rule-set" => {
                let rule_set_tag = format!("ruleset-{}", rule.match_value);
                json!({ "rule_set": rule_set_tag, "server": dns_server_tag })
            }
            "domain-suffix" => json!({ "domain_suffix": [&rule.match_value], "server": dns_server_tag }),
            "domain-keyword" => json!({ "domain_keyword": [&rule.match_value], "server": dns_server_tag }),
            "domain-full" => json!({ "domain": [&rule.match_value], "server": dns_server_tag }),
            "domain-regex" => json!({ "domain_regex": [&rule.match_value], "server": dns_server_tag }),
            _ => continue,
        };
        auto_rules.push(dns_rule);
    }

    (auto_servers, auto_rules)
}

fn build_auto_dns_server(base_address: &str, tag: &str, detour: &str) -> Value {
    if base_address.starts_with("https://") {
        let without_scheme = &base_address[8..];
        let (host_port, path) = without_scheme
            .find('/')
            .map(|i| (&without_scheme[..i], &without_scheme[i..]))
            .unwrap_or((without_scheme, "/dns-query"));

        let (host, port) = if let Some(colon) = host_port.rfind(':') {
            (
                &host_port[..colon],
                host_port[colon + 1..].parse::<u16>().unwrap_or(443),
            )
        } else {
            (host_port, 443u16)
        };

        json!({
            "type": "https",
            "tag": tag,
            "server": host,
            "server_port": port,
            "path": path,
            "detour": detour
        })
    } else if base_address.starts_with("tls://") {
        let host = &base_address[6..];
        json!({
            "type": "tls",
            "tag": tag,
            "server": host,
            "server_port": 853,
            "detour": detour
        })
    } else {
        json!({
            "type": "udp",
            "tag": tag,
            "server": base_address,
            "detour": detour
        })
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src-tauri && cargo test auto_dns_generates -- --nocapture`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/singbox/config.rs
git commit -m "feat(dns): add build_auto_dns_entries for route-rule-based DNS generation"
```

---

### Task 2: Wire auto DNS entries into config generation

**Files:**
- Modify: `src-tauri/src/singbox/config.rs` — update `build_dns_section` signature and `generate_config` to pass route rules

- [ ] **Step 1: Write the failing test**

Add to `src-tauri/src/singbox/config.rs` `mod tests`:

```rust
#[test]
fn build_dns_section_includes_auto_entries_from_route_rules() {
    let dns = DnsSettings {
        servers: vec![
            DnsServerConfig {
                id: "dns-proxy".to_string(),
                name: "CF".to_string(),
                address: "https://1.1.1.1/dns-query".to_string(),
                enabled: true,
                detour: None,
                domain_resolver: None,
            },
            DnsServerConfig {
                id: "dns-direct".to_string(),
                name: "Ali".to_string(),
                address: "223.5.5.5".to_string(),
                enabled: true,
                detour: None,
                domain_resolver: None,
            },
        ],
        rules: vec![],
        mode: "fake-ip".to_string(),
        fake_ip_range: "198.18.0.0/15".to_string(),
        final_server: "dns-direct".to_string(),
    };

    let rules_data = rules_storage::RulesData {
        rules: vec![rules_storage::RouteRuleConfig {
            id: "r1".to_string(),
            name: "AI".to_string(),
            enabled: true,
            match_type: "geosite".to_string(),
            match_value: "Ai".to_string(),
            outbound: "proxy".to_string(),
            outbound_node: Some("JP-Node".to_string()),
            rule_set_url: None,
            rule_set_local_path: None,
            download_detour: None,
            invert: false,
            order: 0,
        }],
        final_outbound: "proxy".to_string(),
        final_outbound_node: None,
        update_interval: 86400,
    };

    let all_node_tags = vec!["JP-Node".to_string()];

    let section = build_dns_section(&dns, true, false, &rules_data, &all_node_tags, None);

    let servers = section["servers"].as_array().unwrap();
    let rules = section["rules"].as_array().unwrap();

    // Should have auto-generated server with detour=JP-Node
    assert!(servers.iter().any(|s| s["tag"] == "dns-auto-JP-Node" && s["detour"] == "JP-Node"));

    // Should have auto-generated rule for geosite-Ai
    assert!(rules.iter().any(|r| r["rule_set"] == "geosite-Ai" && r["server"] == "dns-auto-JP-Node"));
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src-tauri && cargo test build_dns_section_includes_auto -- --nocapture`
Expected: FAIL — signature mismatch

- [ ] **Step 3: Update `build_dns_section` signature and body**

Change `build_dns_section` signature from:

```rust
fn build_dns_section(dns: &DnsSettings, force_fake_ip: bool, tailscale_enabled: bool) -> Value {
```

to:

```rust
fn build_dns_section(
    dns: &DnsSettings,
    force_fake_ip: bool,
    tailscale_enabled: bool,
    rules_data: &rules_storage::RulesData,
    all_node_tags: &[String],
    active_node: Option<&str>,
) -> Value {
```

At the end of `build_dns_section`, before the final `json!({...})`, add:

```rust
    // Auto-generate DNS servers/rules from domain-based route rules
    let (auto_servers, auto_rules) =
        build_auto_dns_entries(dns, rules_data, all_node_tags, active_node);
    servers.extend(auto_servers);
    // Insert auto rules before the fakeip catch-all rule (if present)
    // Find the position of the fakeip rule (query_type A/AAAA) to insert before it
    let fakeip_pos = rules.iter().position(|r| r.get("query_type").is_some());
    match fakeip_pos {
        Some(pos) => {
            for (i, rule) in auto_rules.into_iter().enumerate() {
                rules.insert(pos + i, rule);
            }
        }
        None => rules.extend(auto_rules),
    }
```

- [ ] **Step 4: Update `generate_config` call site**

Change line ~21 from:

```rust
    let dns_section = build_dns_section(&dns_settings, settings.enhanced_mode, ts_settings.enabled);
```

to:

```rust
    // dns_section needs route rules info — build it after nodes/rules are ready
```

Move the `dns_section` construction to after `rules_data` and `all_node_tags` are available (after line ~75). Replace the old call with:

```rust
    let dns_section = build_dns_section(
        &dns_settings,
        settings.enhanced_mode,
        ts_settings.enabled,
        &rules_data,
        &all_node_tags,
        nodes_data.active_node.as_deref(),
    );
```

- [ ] **Step 5: Fix existing tests that call `build_dns_section` with old signature**

Update `forcing_fake_ip_overrides_stored_dns_mode` and `dns_section_respects_stored_mode_without_tun` tests to pass the new parameters:

```rust
// In forcing_fake_ip_overrides_stored_dns_mode:
let section = build_dns_section(&dns, true, false, &rules_storage::RulesData::default(), &[], None);

// In dns_section_respects_stored_mode_without_tun:
let section = build_dns_section(&dns, false, false, &rules_storage::RulesData::default(), &[], None);
```

- [ ] **Step 6: Run all tests to verify**

Run: `cd src-tauri && cargo test`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/singbox/config.rs
git commit -m "feat(dns): wire auto DNS entries into config generation from route rules"
```

---

### Task 3: Test edge cases

**Files:**
- Modify: `src-tauri/src/singbox/config.rs` — add tests

- [ ] **Step 1: Test that direct outbound rules don't generate DNS entries**

```rust
#[test]
fn auto_dns_skips_direct_and_reject_rules() {
    let dns = DnsSettings::default();
    let rules_data = rules_storage::RulesData {
        rules: vec![
            rules_storage::RouteRuleConfig {
                id: "r1".to_string(),
                name: "CN Direct".to_string(),
                enabled: true,
                match_type: "geosite".to_string(),
                match_value: "cn".to_string(),
                outbound: "direct".to_string(),
                outbound_node: None,
                rule_set_url: None,
                rule_set_local_path: None,
                download_detour: None,
                invert: false,
                order: 0,
            },
            rules_storage::RouteRuleConfig {
                id: "r2".to_string(),
                name: "Ads Block".to_string(),
                enabled: true,
                match_type: "geosite".to_string(),
                match_value: "ads".to_string(),
                outbound: "reject".to_string(),
                outbound_node: None,
                rule_set_url: None,
                rule_set_local_path: None,
                download_detour: None,
                invert: false,
                order: 1,
            },
        ],
        final_outbound: "proxy".to_string(),
        final_outbound_node: None,
        update_interval: 86400,
    };

    let (auto_servers, auto_rules) = build_auto_dns_entries(&dns, &rules_data, &[], None);

    assert!(auto_servers.is_empty());
    assert!(auto_rules.is_empty());
}
```

- [ ] **Step 2: Test that manual DNS rules take priority (skip auto-generation)**

```rust
#[test]
fn auto_dns_skips_rules_with_existing_manual_dns_rule() {
    let mut dns = DnsSettings::default();
    dns.rules = vec![DnsRuleConfig {
        id: "manual-1".to_string(),
        match_type: "rule_set".to_string(),
        match_value: "geosite-geolocation-!cn".to_string(),
        server: "dns-proxy".to_string(),
        enabled: true,
    }];

    let rules_data = rules_storage::RulesData {
        rules: vec![rules_storage::RouteRuleConfig {
            id: "r1".to_string(),
            name: "Not CN".to_string(),
            enabled: true,
            match_type: "geosite".to_string(),
            match_value: "geolocation-!cn".to_string(),
            outbound: "proxy".to_string(),
            outbound_node: Some("US-Node".to_string()),
            rule_set_url: None,
            rule_set_local_path: None,
            download_detour: None,
            invert: false,
            order: 0,
        }],
        final_outbound: "proxy".to_string(),
        final_outbound_node: None,
        update_interval: 86400,
    };
    let all_node_tags = vec!["US-Node".to_string()];

    let (auto_servers, auto_rules) = build_auto_dns_entries(&dns, &rules_data, &all_node_tags, None);

    // Should skip because manual DNS rule already covers geosite-geolocation-!cn
    assert!(auto_servers.is_empty());
    assert!(auto_rules.is_empty());
}
```

- [ ] **Step 3: Test that multiple rules sharing the same outbound reuse one DNS server**

```rust
#[test]
fn auto_dns_reuses_server_for_same_outbound() {
    let dns = DnsSettings::default();
    let rules_data = rules_storage::RulesData {
        rules: vec![
            rules_storage::RouteRuleConfig {
                id: "r1".to_string(),
                name: "AI".to_string(),
                enabled: true,
                match_type: "geosite".to_string(),
                match_value: "Ai".to_string(),
                outbound: "proxy".to_string(),
                outbound_node: Some("US-Node".to_string()),
                rule_set_url: None,
                rule_set_local_path: None,
                download_detour: None,
                invert: false,
                order: 0,
            },
            rules_storage::RouteRuleConfig {
                id: "r2".to_string(),
                name: "Github".to_string(),
                enabled: true,
                match_type: "geosite".to_string(),
                match_value: "Github".to_string(),
                outbound: "proxy".to_string(),
                outbound_node: Some("US-Node".to_string()),
                rule_set_url: None,
                rule_set_local_path: None,
                download_detour: None,
                invert: false,
                order: 1,
            },
        ],
        final_outbound: "proxy".to_string(),
        final_outbound_node: None,
        update_interval: 86400,
    };
    let all_node_tags = vec!["US-Node".to_string()];

    let (auto_servers, auto_rules) = build_auto_dns_entries(&dns, &rules_data, &all_node_tags, None);

    // Only one DNS server for US-Node
    assert_eq!(auto_servers.len(), 1);
    // Two DNS rules, both pointing to the same server
    assert_eq!(auto_rules.len(), 2);
    assert_eq!(auto_rules[0]["server"], auto_rules[1]["server"]);
}
```

- [ ] **Step 4: Run all tests**

Run: `cd src-tauri && cargo test`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/singbox/config.rs
git commit -m "test(dns): add edge case tests for auto DNS entry generation"
```

---

### Task 4: Test IP-based rules are excluded

**Files:**
- Modify: `src-tauri/src/singbox/config.rs` — add test

- [ ] **Step 1: Test that non-domain match types (ip-cidr, process-name, port) are skipped**

```rust
#[test]
fn auto_dns_skips_non_domain_match_types() {
    let dns = DnsSettings::default();
    let rules_data = rules_storage::RulesData {
        rules: vec![
            rules_storage::RouteRuleConfig {
                id: "r1".to_string(),
                name: "IP Rule".to_string(),
                enabled: true,
                match_type: "ip-cidr".to_string(),
                match_value: "91.108.0.0/16".to_string(),
                outbound: "proxy".to_string(),
                outbound_node: Some("US-Node".to_string()),
                rule_set_url: None,
                rule_set_local_path: None,
                download_detour: None,
                invert: false,
                order: 0,
            },
            rules_storage::RouteRuleConfig {
                id: "r2".to_string(),
                name: "Process".to_string(),
                enabled: true,
                match_type: "process-name".to_string(),
                match_value: "telegram".to_string(),
                outbound: "proxy".to_string(),
                outbound_node: Some("US-Node".to_string()),
                rule_set_url: None,
                rule_set_local_path: None,
                download_detour: None,
                invert: false,
                order: 1,
            },
        ],
        final_outbound: "proxy".to_string(),
        final_outbound_node: None,
        update_interval: 86400,
    };
    let all_node_tags = vec!["US-Node".to_string()];

    let (auto_servers, auto_rules) = build_auto_dns_entries(&dns, &rules_data, &all_node_tags, None);

    assert!(auto_servers.is_empty());
    assert!(auto_rules.is_empty());
}
```

- [ ] **Step 2: Run all tests**

Run: `cd src-tauri && cargo test`
Expected: All tests PASS

- [ ] **Step 3: Commit and push**

```bash
git add src-tauri/src/singbox/config.rs
git commit -m "feat(dns): auto-generate DNS detour from route rules for domain-based matching"
```
