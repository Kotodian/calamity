use chrono::Utc;
use serde::Serialize;
use serde_json::{json, Value};
use uuid::Uuid;

use super::dns_storage::{self, DnsRuleConfig, DnsServerConfig, DnsSettings};
use super::nodes_storage::{self, NodeGroup, NodesData, ProxyNode};
use super::rules_storage::{self, RouteRuleConfig, RulesData};
use super::storage::{self, AppSettings};
use super::subscriptions_storage::{self, SubscriptionsData};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub success: bool,
    pub format: String,
    pub nodes_imported: usize,
    pub nodes_skipped: usize,
    pub rules_imported: usize,
    pub dns_servers_imported: usize,
    pub message: String,
}

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

/// Detect format and dispatch to the right importer.
pub fn import_config(content: &str) -> Result<ImportResult, String> {
    let json: Value =
        serde_json::from_str(content).map_err(|e| format!("Invalid JSON: {}", e))?;

    if json.get("version").is_some() {
        restore_backup(&json)
    } else if json.get("outbounds").is_some() || json.get("inbounds").is_some() {
        import_singbox_native(&json)
    } else {
        Err(
            "Unknown config format: expected Calamity backup (has \"version\") or sing-box config (has \"outbounds\")"
                .to_string(),
        )
    }
}

/// Restore a Calamity backup: overwrite all 5 storage files.
fn restore_backup(json: &Value) -> Result<ImportResult, String> {
    if let Some(settings_val) = json.get("settings") {
        let settings: AppSettings = serde_json::from_value(settings_val.clone())
            .map_err(|e| format!("Invalid settings in backup: {}", e))?;
        storage::save_settings(&settings)?;
    }

    let mut nodes_count = 0;
    if let Some(nodes_val) = json.get("nodes") {
        let nodes: NodesData = serde_json::from_value(nodes_val.clone())
            .map_err(|e| format!("Invalid nodes in backup: {}", e))?;
        nodes_count = nodes.groups.iter().map(|g| g.nodes.len()).sum();
        nodes_storage::save_nodes(&nodes)?;
    }

    let mut rules_count = 0;
    if let Some(rules_val) = json.get("rules") {
        let rules: RulesData = serde_json::from_value(rules_val.clone())
            .map_err(|e| format!("Invalid rules in backup: {}", e))?;
        rules_count = rules.rules.len();
        rules_storage::save_rules(&rules)?;
    }

    let mut dns_count = 0;
    if let Some(dns_val) = json.get("dns") {
        let dns: DnsSettings = serde_json::from_value(dns_val.clone())
            .map_err(|e| format!("Invalid DNS in backup: {}", e))?;
        dns_count = dns.servers.len();
        dns_storage::save_dns_settings(&dns)?;
    }

    if let Some(subs_val) = json.get("subscriptions") {
        let subs: SubscriptionsData = serde_json::from_value(subs_val.clone())
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

/// Supported outbound types that we can convert to ProxyNode.
const SUPPORTED_PROTOCOLS: &[&str] = &[
    "vmess",
    "vless",
    "trojan",
    "shadowsocks",
    "hysteria2",
    "tuic",
    "anytls",
];

fn import_singbox_native(json: &Value) -> Result<ImportResult, String> {
    let mut nodes_imported = 0;
    let mut nodes_skipped = 0;
    let mut rules_imported = 0;
    let mut dns_servers_imported = 0;

    // --- 1. Parse outbounds -> nodes ---
    let mut proxy_nodes: Vec<ProxyNode> = Vec::new();

    if let Some(outbounds) = json.get("outbounds").and_then(|v| v.as_array()) {
        for ob in outbounds {
            let ob_type = ob.get("type").and_then(|v| v.as_str()).unwrap_or("");
            if !SUPPORTED_PROTOCOLS.contains(&ob_type) {
                // Don't count built-in types as skipped
                if ob_type != "direct"
                    && ob_type != "block"
                    && ob_type != "dns"
                    && ob_type != "selector"
                    && ob_type != "urltest"
                {
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

    // --- 2. Parse route -> rules ---
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

    // --- 3. Parse dns -> dns settings ---
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

        let final_server = dns
            .get("final")
            .and_then(|v| v.as_str())
            .unwrap_or("dns-direct")
            .to_string();

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

    // --- 4. Parse inbounds -> settings (ports, TUN) ---
    let mut settings = AppSettings::default();
    if let Some(inbounds) = json.get("inbounds").and_then(|v| v.as_array()) {
        for inbound in inbounds {
            let ib_type = inbound.get("type").and_then(|v| v.as_str()).unwrap_or("");
            let port = inbound
                .get("listen_port")
                .and_then(|v| v.as_u64())
                .unwrap_or(0) as u16;
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
    subscriptions_storage::save_subscriptions(&SubscriptionsData {
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
                    config["obfsPassword"] = json!(
                        obfs.get("password")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                    );
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
            let sni = ob
                .get("tls")
                .and_then(|v| v.get("server_name"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let idle = ob
                .get("idle_timeout")
                .and_then(|v| v.as_str())
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

    let enabled = tls
        .get("enabled")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    if !enabled {
        return;
    }

    let sni = tls
        .get("server_name")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let alpn = tls
        .get("alpn")
        .and_then(|v| v.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let insecure = tls
        .get("insecure")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

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
        if reality
            .get("enabled")
            .and_then(|v| v.as_bool())
            .unwrap_or(false)
        {
            tls_config["reality"] = json!(true);
            tls_config["realityPublicKey"] = json!(reality
                .get("public_key")
                .and_then(|v| v.as_str())
                .unwrap_or(""));
            tls_config["realityShortId"] = json!(reality
                .get("short_id")
                .and_then(|v| v.as_str())
                .unwrap_or(""));
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

    let t_type = transport
        .get("type")
        .and_then(|v| v.as_str())
        .unwrap_or("tcp");

    let mut t_config = json!({ "type": t_type });

    match t_type {
        "ws" => {
            t_config["wsPath"] =
                json!(transport
                    .get("path")
                    .and_then(|v| v.as_str())
                    .unwrap_or("/"));
            if let Some(headers) = transport.get("headers").and_then(|v| v.as_object()) {
                t_config["wsHeaders"] = json!(headers);
            }
        }
        "grpc" => {
            t_config["grpcServiceName"] = json!(transport
                .get("service_name")
                .and_then(|v| v.as_str())
                .unwrap_or(""));
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
    let outbound = rule.get("outbound").and_then(|v| v.as_str())?;
    let outbound_normalized = normalize_outbound_name(outbound);

    let (match_type, match_value) =
        if let Some(v) = rule.get("rule_set").and_then(|v| v.as_str()) {
            if let Some(rest) = v.strip_prefix("geosite-") {
                ("geosite".to_string(), rest.to_string())
            } else if let Some(rest) = v.strip_prefix("geoip-") {
                ("geoip".to_string(), rest.to_string())
            } else {
                return None;
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
        invert: false,
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
        arr.first()
            .and_then(|v| v.as_u64())
            .map(|p| p.to_string())
    } else {
        rule.get(key)
            .and_then(|v| v.as_u64())
            .map(|p| p.to_string())
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
    let server_type = server
        .get("type")
        .and_then(|v| v.as_str())
        .unwrap_or("udp");

    // Skip fakeip servers (Calamity generates these automatically)
    if server_type == "fakeip" {
        return None;
    }

    let host = server
        .get("server")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let port = server
        .get("server_port")
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as u16;

    let address = match server_type {
        "https" => {
            let path = server
                .get("path")
                .and_then(|v| v.as_str())
                .unwrap_or("/dns-query");
            if port == 443 {
                format!("https://{}{}", host, path)
            } else {
                format!("https://{}:{}{}", host, port, path)
            }
        }
        "tls" => format!("tls://{}", host),
        _ => host.to_string(),
    };

    let detour = server
        .get("detour")
        .and_then(|v| v.as_str())
        .map(String::from);
    let domain_resolver = server
        .get("domain_resolver")
        .and_then(|v| v.as_str())
        .map(String::from);

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

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    // --- Pure function tests (no filesystem) ---

    #[test]
    fn rejects_invalid_json() {
        let result = import_config("not json at all");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Invalid JSON"));
    }

    #[test]
    fn rejects_unknown_format() {
        let result = import_config(r#"{"foo": "bar"}"#);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Unknown config format"));
    }

    #[test]
    fn normalizes_outbound_names() {
        assert_eq!(normalize_outbound_name("direct-out"), "direct");
        assert_eq!(normalize_outbound_name("direct"), "direct");
        assert_eq!(normalize_outbound_name("block-out"), "reject");
        assert_eq!(normalize_outbound_name("block"), "reject");
        assert_eq!(normalize_outbound_name("reject"), "reject");
        assert_eq!(normalize_outbound_name("my-proxy"), "proxy");
    }

    #[test]
    fn parses_vmess_outbound() {
        let ob = json!({
            "type": "vmess",
            "tag": "my-vmess",
            "server": "example.com",
            "server_port": 443,
            "uuid": "test-uuid-1234",
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
        assert_eq!(config["uuid"], "test-uuid-1234");
        assert_eq!(config["tls"]["enabled"], true);
        assert_eq!(config["tls"]["sni"], "example.com");
        assert_eq!(config["transport"]["type"], "ws");
        assert_eq!(config["transport"]["wsPath"], "/ws");
    }

    #[test]
    fn parses_vless_with_reality() {
        let ob = json!({
            "type": "vless",
            "tag": "vless-reality",
            "server": "1.2.3.4",
            "server_port": 443,
            "uuid": "vless-uuid",
            "flow": "xtls-rprx-vision",
            "tls": {
                "enabled": true,
                "server_name": "www.microsoft.com",
                "reality": {
                    "enabled": true,
                    "public_key": "abc123",
                    "short_id": "def456"
                }
            }
        });

        let node = parse_outbound_to_node(&ob).expect("should parse vless");
        let config = node.protocol_config.unwrap();
        assert_eq!(config["type"], "vless");
        assert_eq!(config["flow"], "xtls-rprx-vision");
        assert_eq!(config["tls"]["reality"], true);
        assert_eq!(config["tls"]["realityPublicKey"], "abc123");
        assert_eq!(config["tls"]["realityShortId"], "def456");
    }

    #[test]
    fn parses_trojan_outbound() {
        let ob = json!({
            "type": "trojan",
            "tag": "my-trojan",
            "server": "trojan.example.com",
            "server_port": 443,
            "password": "secret123",
            "tls": { "enabled": true, "server_name": "trojan.example.com" }
        });

        let node = parse_outbound_to_node(&ob).expect("should parse trojan");
        assert_eq!(node.protocol, "trojan");
        assert_eq!(node.protocol_config.unwrap()["password"], "secret123");
    }

    #[test]
    fn parses_shadowsocks_outbound() {
        let ob = json!({
            "type": "shadowsocks",
            "tag": "my-ss",
            "server": "ss.example.com",
            "server_port": 8388,
            "password": "ss-pass",
            "method": "aes-256-gcm"
        });

        let node = parse_outbound_to_node(&ob).expect("should parse shadowsocks");
        let config = node.protocol_config.unwrap();
        assert_eq!(config["method"], "aes-256-gcm");
        assert_eq!(config["password"], "ss-pass");
    }

    #[test]
    fn parses_hysteria2_outbound() {
        let ob = json!({
            "type": "hysteria2",
            "tag": "my-hy2",
            "server": "hy2.example.com",
            "server_port": 443,
            "password": "hy2-pass",
            "up_mbps": 100,
            "down_mbps": 200,
            "obfs": { "type": "salamander", "password": "obfs-pass" },
            "tls": { "enabled": true, "server_name": "hy2.example.com" }
        });

        let node = parse_outbound_to_node(&ob).expect("should parse hysteria2");
        let config = node.protocol_config.unwrap();
        assert_eq!(config["upMbps"], 100);
        assert_eq!(config["downMbps"], 200);
        assert_eq!(config["obfsType"], "salamander");
        assert_eq!(config["obfsPassword"], "obfs-pass");
    }

    #[test]
    fn parses_tuic_outbound() {
        let ob = json!({
            "type": "tuic",
            "tag": "my-tuic",
            "server": "tuic.example.com",
            "server_port": 443,
            "uuid": "tuic-uuid",
            "password": "tuic-pass",
            "congestion_control": "cubic",
            "udp_relay_mode": "quic",
            "tls": { "enabled": true, "server_name": "tuic.example.com" }
        });

        let node = parse_outbound_to_node(&ob).expect("should parse tuic");
        let config = node.protocol_config.unwrap();
        assert_eq!(config["congestionControl"], "cubic");
        assert_eq!(config["udpRelayMode"], "quic");
    }

    #[test]
    fn parses_anytls_outbound() {
        let ob = json!({
            "type": "anytls",
            "tag": "my-anytls",
            "server": "any.example.com",
            "server_port": 443,
            "password": "anytls-pass",
            "tls": { "enabled": true, "server_name": "any.example.com" },
            "idle_timeout": "600s",
            "min_padding_len": 10,
            "max_padding_len": 100
        });

        let node = parse_outbound_to_node(&ob).expect("should parse anytls");
        let config = node.protocol_config.unwrap();
        assert_eq!(config["sni"], "any.example.com");
        assert_eq!(config["idleTimeout"], 600);
        assert_eq!(config["minPaddingLen"], 10);
        assert_eq!(config["maxPaddingLen"], 100);
    }

    #[test]
    fn skips_outbound_without_server() {
        let ob = json!({
            "type": "vmess",
            "tag": "bad-node",
            "server": "",
            "server_port": 443,
            "uuid": "some-uuid"
        });

        assert!(parse_outbound_to_node(&ob).is_none());
    }

    #[test]
    fn skips_outbound_without_port() {
        let ob = json!({
            "type": "vmess",
            "tag": "bad-node",
            "server": "example.com",
            "server_port": 0,
            "uuid": "some-uuid"
        });

        assert!(parse_outbound_to_node(&ob).is_none());
    }

    #[test]
    fn parses_route_rule_domain_suffix() {
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
    fn parses_route_rule_geosite() {
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
    fn parses_route_rule_geoip() {
        let rule = json!({
            "rule_set": "geoip-cn",
            "action": "route",
            "outbound": "direct-out"
        });

        let parsed = parse_route_rule(&rule, 1).expect("should parse geoip rule");
        assert_eq!(parsed.match_type, "geoip");
        assert_eq!(parsed.match_value, "cn");
        assert_eq!(parsed.order, 1);
    }

    #[test]
    fn skips_action_only_route_rules() {
        let rule = json!({ "action": "sniff" });
        assert!(parse_route_rule(&rule, 0).is_none());
    }

    #[test]
    fn parses_https_dns_server() {
        let server = json!({
            "type": "https",
            "tag": "dns-google",
            "server": "dns.google",
            "server_port": 443,
            "path": "/dns-query",
            "domain_resolver": "dns-bootstrap"
        });

        let parsed = parse_dns_server(&server).expect("should parse HTTPS DNS");
        assert_eq!(parsed.id, "dns-google");
        assert_eq!(parsed.address, "https://dns.google/dns-query");
        assert_eq!(parsed.domain_resolver, Some("dns-bootstrap".to_string()));
    }

    #[test]
    fn parses_tls_dns_server() {
        let server = json!({
            "type": "tls",
            "tag": "dns-dot",
            "server": "dns.google",
            "server_port": 853
        });

        let parsed = parse_dns_server(&server).expect("should parse TLS DNS");
        assert_eq!(parsed.address, "tls://dns.google");
    }

    #[test]
    fn parses_udp_dns_server() {
        let server = json!({
            "type": "udp",
            "tag": "dns-plain",
            "server": "8.8.8.8"
        });

        let parsed = parse_dns_server(&server).expect("should parse UDP DNS");
        assert_eq!(parsed.address, "8.8.8.8");
    }

    #[test]
    fn skips_fakeip_dns_server() {
        let server = json!({
            "type": "fakeip",
            "tag": "dns-fakeip",
            "inet4_range": "198.18.0.0/15"
        });

        assert!(parse_dns_server(&server).is_none());
    }

    #[test]
    fn parses_dns_rule_domain_suffix() {
        let rule = json!({
            "domain_suffix": [".ts.net"],
            "server": "tailscale"
        });

        let parsed = parse_dns_rule(&rule).expect("should parse DNS rule");
        assert_eq!(parsed.match_type, "domain-suffix");
        assert_eq!(parsed.match_value, ".ts.net");
        assert_eq!(parsed.server, "tailscale");
    }

    #[test]
    fn parses_dns_rule_with_rule_set() {
        let rule = json!({
            "rule_set": "geosite-cn",
            "server": "dns-direct"
        });

        let parsed = parse_dns_rule(&rule).expect("should parse DNS rule_set rule");
        assert_eq!(parsed.match_type, "rule_set");
        assert_eq!(parsed.match_value, "geosite-cn");
    }

    #[test]
    fn parses_grpc_transport() {
        let ob = json!({
            "type": "vless",
            "tag": "grpc-node",
            "server": "grpc.example.com",
            "server_port": 443,
            "uuid": "test-uuid",
            "transport": {
                "type": "grpc",
                "service_name": "myservice"
            }
        });

        let node = parse_outbound_to_node(&ob).unwrap();
        let config = node.protocol_config.unwrap();
        assert_eq!(config["transport"]["type"], "grpc");
        assert_eq!(config["transport"]["grpcServiceName"], "myservice");
    }

    #[test]
    fn parses_http_transport_as_h2() {
        let ob = json!({
            "type": "vmess",
            "tag": "h2-node",
            "server": "h2.example.com",
            "server_port": 443,
            "uuid": "test-uuid",
            "transport": {
                "type": "http",
                "host": ["h2.example.com"]
            }
        });

        let node = parse_outbound_to_node(&ob).unwrap();
        let config = node.protocol_config.unwrap();
        assert_eq!(config["transport"]["type"], "h2");
        assert_eq!(config["transport"]["h2Host"], json!(["h2.example.com"]));
    }
}
