use serde_json::{json, Value};

use super::dns_storage::{self, DnsRuleConfig, DnsServerConfig, DnsSettings};
use super::nodes_storage;
use super::outbounds;
use super::rules_storage;
use super::storage::{self, AppSettings};

pub fn generate_config(settings: &AppSettings) -> Value {
    let listen = if settings.allow_lan { "0.0.0.0" } else { "127.0.0.1" };

    let mut inbounds = vec![
        json!({
            "type": "mixed",
            "tag": "mixed-in",
            "listen": listen,
            "listen_port": settings.mixed_port
        }),
    ];

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

    let dns_settings = dns_storage::load_dns_settings();
    let dns_section = build_dns_section(&dns_settings);

    // Use bootstrap resolver (plain UDP) as default_domain_resolver
    let default_resolver = dns_settings
        .servers
        .iter()
        .find(|s| s.enabled && s.domain_resolver.is_none() && !s.address.starts_with("https://") && !s.address.starts_with("tls://"))
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

    // Route final: active node or direct-out
    let route_final = nodes_data
        .active_node
        .as_ref()
        .filter(|id| all_node_tags.contains(id))
        .cloned()
        .unwrap_or_else(|| "direct-out".to_string());

    // Build route rules from stored rules
    let rules_data = rules_storage::load_rules();
    let (route_rules, rule_sets) = build_route_rules(&rules_data, &all_node_tags);

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

fn build_dns_section(dns: &DnsSettings) -> Value {
    let servers: Vec<Value> = dns
        .servers
        .iter()
        .filter(|s| s.enabled)
        .map(|s| build_dns_server(s))
        .collect();

    let rules: Vec<Value> = dns
        .rules
        .iter()
        .filter(|r| r.enabled)
        .filter_map(|r| build_dns_rule(r))
        .collect();

    let mut section = json!({
        "final": dns.final_server,
        "servers": servers,
        "rules": rules
    });

    if dns.mode == "fake-ip" {
        section["fakeip"] = json!({
            "enabled": true,
            "inet4_range": dns.fake_ip_range
        });
    }

    section
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
            (&host_port[..colon], host_port[colon + 1..].parse::<u16>().unwrap_or(443))
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
) -> (Vec<Value>, Vec<Value>) {
    let mut route_rules: Vec<Value> = Vec::new();
    let mut rule_sets: Vec<Value> = Vec::new();
    let mut seen_rule_sets: std::collections::HashSet<String> = std::collections::HashSet::new();

    for rule in &rules_data.rules {
        if !rule.enabled {
            continue;
        }

        let outbound_tag = resolve_outbound(&rule.outbound, &rule.outbound_node, all_node_tags);

        match rule.match_type.as_str() {
            "geosite" | "geoip" => {
                let rule_set_tag = format!("{}-{}", rule.match_type, rule.match_value);

                route_rules.push(json!({
                    "rule_set": rule_set_tag,
                    "outbound": outbound_tag
                }));

                if !seen_rule_sets.contains(&rule_set_tag) {
                    seen_rule_sets.insert(rule_set_tag.clone());

                    let has_local = rule.rule_set_local_path.as_ref().is_some_and(|p| !p.is_empty());

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
                                "proxy" => all_node_tags.first().cloned().unwrap_or_else(|| "direct-out".to_string()),
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
                            let ports: Vec<u16> = rule.match_value
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
                    "outbound": outbound_tag
                }));
            }
        }
    }

    (route_rules, rule_sets)
}

fn resolve_outbound(outbound: &str, outbound_node: &Option<String>, all_node_tags: &[String]) -> String {
    match outbound {
        "direct" => "direct-out".to_string(),
        "reject" => "block-out".to_string(),
        "proxy" => {
            if let Some(node) = outbound_node {
                if all_node_tags.contains(node) {
                    node.clone()
                } else {
                    "direct-out".to_string()
                }
            } else {
                "direct-out".to_string()
            }
        }
        _ => "direct-out".to_string(),
    }
}

pub fn write_config(settings: &AppSettings) -> Result<String, String> {
    let config = generate_config(settings);
    let path = storage::singbox_config_path();
    let content = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    std::fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}
