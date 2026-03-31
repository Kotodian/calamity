use serde_json::{json, Value};

use super::dns_storage::{self, DnsRuleConfig, DnsServerConfig, DnsSettings};
use super::nodes_storage;
use super::outbounds;
use super::rules_storage;
use super::storage::{self, AppSettings};

pub fn generate_config(settings: &AppSettings) -> Value {
    let listen = if settings.allow_lan {
        "0.0.0.0"
    } else {
        "127.0.0.1"
    };
    let inbounds = build_inbounds(settings, listen);

    let dns_settings = dns_storage::load_dns_settings();
    let dns_section = build_dns_section(&dns_settings, settings.enhanced_mode);

    // Use bootstrap resolver (plain UDP) as default_domain_resolver
    let default_resolver = dns_settings
        .servers
        .iter()
        .find(|s| {
            s.enabled
                && s.domain_resolver.is_none()
                && !s.address.starts_with("https://")
                && !s.address.starts_with("tls://")
        })
        .or_else(|| dns_settings.servers.iter().find(|s| s.enabled))
        .map(|s| s.id.clone())
        .unwrap_or_else(|| "dns-resolver".to_string());

    // Build outbounds from nodes
    let nodes_data = nodes_storage::load_nodes();
    let mut outbound_list: Vec<Value> = Vec::new();
    let mut all_node_tags: Vec<String> = Vec::new();

    for group in &nodes_data.groups {
        for node in &group.nodes {
            if let Some(ob) = outbounds::build_outbound(node) {
                all_node_tags.push(node.name.clone());
                outbound_list.push(ob);
            }
        }
    }

    // Generate urltest outbounds for urltest groups
    for group in &nodes_data.groups {
        if group.group_type == "urltest" {
            let tags: Vec<String> = group
                .nodes
                .iter()
                .map(|n| n.name.clone())
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

    // Build route rules from stored rules
    let rules_data = rules_storage::load_rules();
    let route_final =
        resolve_route_final(&rules_data, &all_node_tags, nodes_data.active_node.as_deref());
    let (stored_route_rules, rule_sets) =
        build_route_rules(&rules_data, &all_node_tags, nodes_data.active_node.as_deref());
    let mut route_rules = build_pre_match_route_rules(settings);
    route_rules.extend(stored_route_rules);

    let mut route_section = json!({
        "auto_detect_interface": true,
        "final": route_final,
        "default_domain_resolver": {
            "server": default_resolver
        }
    });

    if !route_rules.is_empty() {
        route_section["rules"] = json!(route_rules);
    }
    if !rule_sets.is_empty() {
        route_section["rule_set"] = json!(rule_sets);
    }

    json!({
        "log": {
            "level": settings.log_level,
            "timestamp": true
        },
        "dns": dns_section,
        "inbounds": inbounds,
        "outbounds": outbound_list,
        "route": route_section,
        "experimental": {
            "clash_api": {
                "external_controller": "127.0.0.1:9091",
                "default_mode": "Rule"
            }
        }
    })
}

fn build_inbounds(settings: &AppSettings, listen: &str) -> Vec<Value> {
    let mut inbounds = vec![json!({
        "type": "mixed",
        "tag": "mixed-in",
        "listen": listen,
        "listen_port": settings.mixed_port
    })];

    if settings.http_port > 0 {
        inbounds.push(json!({
            "type": "http",
            "tag": "http-in",
            "listen": listen,
            "listen_port": settings.http_port
        }));
    }

    if settings.socks_port > 0 {
        inbounds.push(json!({
            "type": "socks",
            "tag": "socks-in",
            "listen": listen,
            "listen_port": settings.socks_port
        }));
    }

    if settings.enhanced_mode {
        inbounds.push(build_tun_inbound(settings));
    }

    inbounds
}

fn build_tun_inbound(settings: &AppSettings) -> Value {
    json!({
        "type": "tun",
        "tag": "tun-in",
        "interface_name": "",
        "address": ["172.19.0.1/30"],
        "mtu": settings.tun_config.mtu,
        "auto_route": settings.tun_config.auto_route,
        "strict_route": settings.tun_config.strict_route,
        "stack": settings.tun_config.stack,
        "platform": {
            "http_proxy": {
                "enabled": false
            }
        }
    })
}

fn build_dns_section(dns: &DnsSettings, force_fake_ip: bool) -> Value {
    let mut servers: Vec<Value> = dns
        .servers
        .iter()
        .filter(|s| s.enabled)
        .map(|s| build_dns_server(s))
        .collect();

    let mut rules: Vec<Value> = dns
        .rules
        .iter()
        .filter(|r| r.enabled)
        .filter_map(|r| build_dns_rule(r))
        .collect();

    if force_fake_ip || dns.mode == "fake-ip" {
        // sing-box 1.12+: fakeip is a DNS server type, not a top-level field
        servers.push(json!({
            "type": "fakeip",
            "tag": "dns-fakeip",
            "inet4_range": dns.fake_ip_range
        }));
        rules.push(json!({
            "query_type": ["A", "AAAA"],
            "server": "dns-fakeip"
        }));
    }

    json!({
        "final": dns.final_server,
        "servers": servers,
        "rules": rules
    })
}

fn build_dns_server(server: &DnsServerConfig) -> Value {
    let addr = &server.address;

    // sing-box 1.12+ requires new DNS server format with type/server/server_port
    let mut val = if addr.starts_with("https://") {
        // "https://1.1.1.1/dns-query" or "https://dns.alidns.com/dns-query"
        let without_scheme = &addr[8..];
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
            "tag": server.id,
            "server": host,
            "server_port": port,
            "path": path
        })
    } else if addr.starts_with("tls://") {
        let host = &addr[6..];
        json!({
            "type": "tls",
            "tag": server.id,
            "server": host,
            "server_port": 853
        })
    } else {
        // Plain IP → UDP
        json!({
            "type": "udp",
            "tag": server.id,
            "server": addr
        })
    };

    // detour: only set when routing through a proxy (not "direct-out", which is default)
    if let Some(detour) = &server.detour {
        if detour != "direct-out" {
            val["detour"] = json!(detour);
        }
    }

    // domain_resolver: required when server address uses a domain name
    if let Some(resolver) = &server.domain_resolver {
        val["domain_resolver"] = json!(resolver);
    }

    val
}

fn build_dns_rule(rule: &DnsRuleConfig) -> Option<Value> {
    let key = match rule.match_type.as_str() {
        "domain" => "domain",
        "domain-suffix" => "domain_suffix",
        "domain-keyword" => "domain_keyword",
        "domain-regex" => "domain_regex",
        "rule_set" => "rule_set",
        _ => return None,
    };

    if rule.match_type == "rule_set" {
        Some(json!({
            "rule_set": rule.match_value,
            "server": rule.server
        }))
    } else {
        Some(json!({
            key: [rule.match_value],
            "server": rule.server
        }))
    }
}

fn build_route_rules(
    rules_data: &rules_storage::RulesData,
    all_node_tags: &[String],
    active_node: Option<&str>,
) -> (Vec<Value>, Vec<Value>) {
    let mut route_rules: Vec<Value> = Vec::new();
    let mut rule_sets: Vec<Value> = Vec::new();
    let mut seen_rule_sets: std::collections::HashSet<String> = std::collections::HashSet::new();

    for rule in &rules_data.rules {
        if !rule.enabled {
            continue;
        }

        let outbound_tag =
            resolve_outbound(&rule.outbound, &rule.outbound_node, all_node_tags, active_node);

        match rule.match_type.as_str() {
            "geosite" | "geoip" => {
                let rule_set_tag = format!("{}-{}", rule.match_type, rule.match_value);

                route_rules.push(json!({
                    "rule_set": rule_set_tag,
                    "action": "route",
                    "outbound": outbound_tag
                }));

                if !seen_rule_sets.contains(&rule_set_tag) {
                    seen_rule_sets.insert(rule_set_tag.clone());

                    let has_local = rule
                        .rule_set_local_path
                        .as_ref()
                        .is_some_and(|p| !p.is_empty());

                    if has_local {
                        rule_sets.push(json!({
                            "tag": rule_set_tag,
                            "type": "local",
                            "format": "binary",
                            "path": rule.rule_set_local_path.as_ref().unwrap()
                        }));
                    } else {
                        let url = rule.rule_set_url.clone().unwrap_or_else(|| {
                            let base = if rule.match_type == "geosite" {
                                "https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set"
                            } else {
                                "https://raw.githubusercontent.com/SagerNet/sing-geoip/rule-set"
                            };
                            format!("{}/{}-{}.srs", base, rule.match_type, rule.match_value)
                        });

                        let mut rs = json!({
                            "tag": rule_set_tag,
                            "type": "remote",
                            "format": "binary",
                            "url": url,
                            "update_interval": format!("{}s", rules_data.update_interval)
                        });

                        if let Some(detour) = &rule.download_detour {
                            let detour_tag = match detour.as_str() {
                                "direct" => "direct-out".to_string(),
                                "proxy" => all_node_tags
                                    .first()
                                    .cloned()
                                    .unwrap_or_else(|| "direct-out".to_string()),
                                other => other.to_string(),
                            };
                            rs["download_detour"] = json!(detour_tag);
                        }

                        rule_sets.push(rs);
                    }
                }
            }
            _ => {
                let key = match rule.match_type.as_str() {
                    "domain-suffix" => "domain_suffix",
                    "domain-keyword" => "domain_keyword",
                    "domain-full" => "domain",
                    "domain-regex" => "domain_regex",
                    "ip-cidr" => "ip_cidr",
                    "process-name" => "process_name",
                    "process-path" => "process_path",
                    "process-path-regex" => "process_path_regex",
                    "port" => "port",
                    "port-range" => "port_range",
                    "network" => "network",
                    _ => continue,
                };

                let value: Value = match rule.match_type.as_str() {
                    "port" => {
                        if let Ok(p) = rule.match_value.parse::<u16>() {
                            json!([p])
                        } else {
                            let ports: Vec<u16> = rule
                                .match_value
                                .split(',')
                                .filter_map(|s| s.trim().parse().ok())
                                .collect();
                            json!(ports)
                        }
                    }
                    "network" => json!(rule.match_value),
                    _ => json!([&rule.match_value]),
                };

                route_rules.push(json!({
                    key: value,
                    "action": "route",
                    "outbound": outbound_tag
                }));
            }
        }
    }

    (route_rules, rule_sets)
}

fn build_pre_match_route_rules(settings: &AppSettings) -> Vec<Value> {
    let mut rules = vec![
        // Sniff TLS/HTTP to extract domain from SNI/Host header
        json!({
            "action": "sniff"
        }),
    ];
    if settings.enhanced_mode {
        rules.push(json!({
            "inbound": ["tun-in"],
            "action": "resolve",
            "strategy": "ipv4_only"
        }));
    }
    // Private/LAN traffic bypasses proxy
    rules.push(json!({
        "ip_is_private": true,
        "action": "route",
        "outbound": "direct-out"
    }));
    rules
}

fn resolve_route_final(
    rules_data: &rules_storage::RulesData,
    all_node_tags: &[String],
    active_node: Option<&str>,
) -> String {
    match rules_data.final_outbound.as_str() {
        "direct" => "direct-out".to_string(),
        "reject" => "block-out".to_string(),
        "proxy" => rules_data
            .final_outbound_node
            .as_ref()
            .filter(|node| all_node_tags.contains(node))
            .cloned()
            .or_else(|| {
                active_node
                    .filter(|node| all_node_tags.iter().any(|tag| tag == node))
                    .map(ToOwned::to_owned)
            })
            .unwrap_or_else(|| "direct-out".to_string()),
        other => all_node_tags
            .iter()
            .find(|tag| tag.as_str() == other)
            .cloned()
            .unwrap_or_else(|| "direct-out".to_string()),
    }
}

fn resolve_outbound(
    outbound: &str,
    outbound_node: &Option<String>,
    all_node_tags: &[String],
    active_node: Option<&str>,
) -> String {
    match outbound {
        "direct" => "direct-out".to_string(),
        "reject" => "block-out".to_string(),
        "proxy" => {
            // 1. Use specified node if valid
            if let Some(node) = outbound_node {
                if all_node_tags.contains(node) {
                    return node.clone();
                }
            }
            // 2. Fallback to active node
            if let Some(active) = active_node {
                if all_node_tags.iter().any(|t| t == active) {
                    return active.to_string();
                }
            }
            // 3. Fallback to first available node
            all_node_tags
                .first()
                .cloned()
                .unwrap_or_else(|| "direct-out".to_string())
        }
        _ => "direct-out".to_string(),
    }
}

/// Write sing-box config as split files in a config directory.
/// Returns the path to the config directory (for use with `sing-box run -C`).
pub fn write_config(settings: &AppSettings) -> Result<String, String> {
    let config = generate_config(settings);
    let config_dir = storage::singbox_config_dir();
    std::fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;

    // Clean old files
    if let Ok(entries) = std::fs::read_dir(&config_dir) {
        for entry in entries.flatten() {
            if entry.path().extension().is_some_and(|e| e == "json") {
                let _ = std::fs::remove_file(entry.path());
            }
        }
    }

    // 01 - log + experimental (clash api)
    let base = json!({
        "log": config["log"],
        "experimental": config["experimental"],
    });
    write_split_file(&config_dir, "01-base.json", &base)?;

    // 02 - dns
    let dns = json!({ "dns": config["dns"] });
    write_split_file(&config_dir, "02-dns.json", &dns)?;

    // 03 - inbounds
    let inbounds = json!({ "inbounds": config["inbounds"] });
    write_split_file(&config_dir, "03-inbounds.json", &inbounds)?;

    // 04 - outbounds
    let outbounds = json!({ "outbounds": config["outbounds"] });
    write_split_file(&config_dir, "04-outbounds.json", &outbounds)?;

    // 05 - route (may be large due to rules)
    let route = json!({ "route": config["route"] });
    write_split_file(&config_dir, "05-route.json", &route)?;

    Ok(config_dir.to_string_lossy().to_string())
}

fn write_split_file(
    dir: &std::path::Path,
    filename: &str,
    value: &serde_json::Value,
) -> Result<(), String> {
    let path = dir.join(filename);
    let content = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::singbox::dns_storage::DnsSettings;

    #[test]
    fn enhanced_mode_adds_tun_inbound() {
        let mut settings = AppSettings::default();
        settings.enhanced_mode = true;
        settings.tun_config.stack = "mixed".to_string();
        settings.tun_config.mtu = 1500;
        settings.tun_config.auto_route = true;
        settings.tun_config.strict_route = true;
        settings.tun_config.dns_hijack = vec!["198.18.0.2:53".to_string()];

        let inbounds = build_inbounds(&settings, "127.0.0.1");

        let tun = inbounds
            .iter()
            .find(|inbound| inbound["type"] == "tun")
            .expect("tun inbound should be present when enhanced mode is enabled");

        assert_eq!(tun["tag"], "tun-in");
        assert_eq!(tun["interface_name"], "");
        assert_eq!(tun["stack"], "mixed");
        assert_eq!(tun["mtu"], 1500);
        assert_eq!(tun["auto_route"], true);
        assert_eq!(tun["strict_route"], true);
        assert_eq!(tun["address"][0], "172.19.0.1/30");
        assert!(tun.get("domain_strategy").is_none());
        assert_eq!(tun["platform"]["http_proxy"]["enabled"], false);
        // dns_hijack removed in sing-box 1.12+
        assert!(tun.get("dns_hijack").is_none());
    }

    #[test]
    fn enhanced_mode_adds_ipv4_resolve_route_action() {
        let mut settings = AppSettings::default();
        settings.enhanced_mode = true;

        let config = generate_config(&settings);
        let rules = config["route"]["rules"]
            .as_array()
            .expect("route rules should be present");

        assert!(rules.iter().any(|rule| {
            rule["inbound"] == json!(["tun-in"])
                && rule["action"] == "resolve"
                && rule["strategy"] == "ipv4_only"
        }));
    }

    #[test]
    fn route_rules_use_explicit_route_action() {
        let rules_data = rules_storage::RulesData {
            rules: vec![rules_storage::RouteRuleConfig {
                id: "rule-1".to_string(),
                name: "Direct Example".to_string(),
                enabled: true,
                match_type: "domain-suffix".to_string(),
                match_value: "example.com".to_string(),
                outbound: "direct".to_string(),
                outbound_node: None,
                rule_set_url: None,
                rule_set_local_path: None,
                download_detour: None,
                order: 0,
            }],
            final_outbound: "proxy".to_string(),
            final_outbound_node: None,
            update_interval: 86400,
        };

        let (rules, _) = build_route_rules(&rules_data, &[], None);

        assert_eq!(rules[0]["action"], "route");
        assert_eq!(rules[0]["outbound"], "direct-out");
    }

    #[test]
    fn configured_final_outbound_overrides_active_node() {
        let all_node_tags = vec!["Proxy-A".to_string()];
        let rules_data = rules_storage::RulesData {
            rules: vec![],
            final_outbound: "direct".to_string(),
            final_outbound_node: None,
            update_interval: 86400,
        };

        let final_outbound = resolve_route_final(&rules_data, &all_node_tags, Some("Proxy-A"));

        assert_eq!(final_outbound, "direct-out");
    }

    #[test]
    fn forcing_fake_ip_overrides_stored_dns_mode() {
        let mut dns = DnsSettings::default();
        dns.mode = "direct".to_string();

        let section = build_dns_section(&dns, true);
        let servers = section["servers"]
            .as_array()
            .expect("dns servers should be present");
        let rules = section["rules"]
            .as_array()
            .expect("dns rules should be present");

        assert!(servers.iter().any(|server| {
            server["type"] == "fakeip"
                && server["tag"] == "dns-fakeip"
                && server["inet4_range"] == "198.18.0.0/15"
        }));
        assert!(rules
            .iter()
            .any(|rule| rule["server"] == "dns-fakeip" && rule["query_type"] == json!(["A", "AAAA"])));
    }

    #[test]
    fn dns_section_respects_stored_mode_without_tun() {
        let mut dns = DnsSettings::default();
        dns.mode = "direct".to_string();

        let section = build_dns_section(&dns, false);

        assert!(section.get("fakeip").is_none());
    }
}
