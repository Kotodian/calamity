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

fn parse_proxies(yaml: &Value) -> Vec<ProxyNode> {
    let proxies = yaml.get("proxies").and_then(|v| v.as_array());
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
        .and_then(|v| v.as_array())
        .map(|seq| seq.iter().filter_map(|v| v.as_str()).collect::<Vec<_>>())
        .unwrap_or_default();

    // Clash uses "reality-opts" with "public-key" and "short-id"
    let reality_opts = proxy.get("reality-opts");
    let is_reality = reality_opts.is_some();
    let reality_public_key = reality_opts
        .and_then(|r| r.get("public-key"))
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let reality_short_id = reality_opts
        .and_then(|r| r.get("short-id"))
        .and_then(|v| v.as_str())
        .unwrap_or("");

    json!({
        "enabled": tls_enabled || is_reality,
        "sni": sni,
        "alpn": alpn,
        "insecure": insecure,
        "reality": is_reality,
        "realityPublicKey": reality_public_key,
        "realityShortId": reality_short_id,
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

fn parse_rules(yaml: &Value) -> (Vec<RouteRuleConfig>, Option<String>) {
    let rules_arr = yaml.get("rules").and_then(|v| v.as_array());
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
            invert: false,
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn is_clash_yaml_detects_proxies_keyword() {
        assert!(is_clash_yaml("proxies:\n  - name: test"));
        assert!(is_clash_yaml("mixed-port: 7890\nproxies:\n"));
        assert!(!is_clash_yaml("dm1lc3M6Ly8="));
        assert!(!is_clash_yaml("ss://YWVz"));
    }

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
    fn parse_clash_vless_reality_node() {
        let yaml = r#"
proxies:
  - name: "UK Reality"
    type: vless
    server: 23.249.19.42
    port: 29443
    uuid: "70edd6a6-a7a1-35d8-92d0-baee7646f940"
    flow: xtls-rprx-vision
    tls: true
    servername: gateway.icloud.com
    client-fingerprint: random
    reality-opts:
      public-key: r7Y4Yuz27lReHIk3rOh3hjmLh7vYZA-DuaP8TRvJEB0
      short-id: 9dbff664bba71287
"#;
        let result = parse_clash_yaml(yaml).unwrap();
        assert_eq!(result.nodes.len(), 1);
        let cfg = result.nodes[0].protocol_config.as_ref().unwrap();
        assert_eq!(cfg["tls"]["reality"], true);
        assert_eq!(cfg["tls"]["enabled"], true);
        assert_eq!(cfg["tls"]["realityPublicKey"], "r7Y4Yuz27lReHIk3rOh3hjmLh7vYZA-DuaP8TRvJEB0");
        assert_eq!(cfg["tls"]["realityShortId"], "9dbff664bba71287");
        assert_eq!(cfg["tls"]["sni"], "gateway.icloud.com");
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

    #[test]
    fn parse_clash_rules() {
        let yaml = r#"
proxies: []
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
        assert_eq!(result.rules.len(), 6);
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
rules:
  - GEOSITE,cn,DIRECT
  - GEOIP,CN,DIRECT
  - MATCH,Proxy
"#;
        let result = parse_clash_yaml(yaml).unwrap();
        assert_eq!(result.nodes.len(), 2);
        assert_eq!(result.nodes[0].name, "HK SS");
        assert_eq!(result.nodes[1].name, "JP VMess");
        assert_eq!(result.rules.len(), 2);
        assert_eq!(result.final_outbound, Some("proxy".to_string()));
    }
}
