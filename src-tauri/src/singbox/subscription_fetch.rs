use base64::Engine;
use serde_json::Value;

use super::nodes_storage::ProxyNode;

#[derive(Debug, Clone)]
pub struct SubscriptionUserInfo {
    pub upload: u64,
    pub download: u64,
    pub total: u64,
    pub expire: Option<String>,
}

#[derive(Debug, Clone)]
pub struct FetchResult {
    pub nodes: Vec<ProxyNode>,
    pub user_info: Option<SubscriptionUserInfo>,
}

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
                            let dt = chrono::DateTime::from_timestamp(ts, 0);
                            expire = dt.map(|d| d.to_rfc3339());
                        }
                    }
                }
                _ => {}
            }
        }
    }

    SubscriptionUserInfo {
        upload,
        download,
        total,
        expire,
    }
}

fn parse_standard_uri(
    uri: &str,
) -> Option<(
    String,
    String,
    u16,
    std::collections::HashMap<String, String>,
    String,
)> {
    let hash_idx = uri.find('#');
    let fragment = hash_idx
        .map(|i| {
            urlencoding::decode(&uri[i + 1..])
                .unwrap_or_default()
                .to_string()
        })
        .unwrap_or_default();
    let without_fragment = hash_idx.map(|i| &uri[..i]).unwrap_or(uri);

    let scheme_end = without_fragment.find("://")?;
    let rest = &without_fragment[scheme_end + 3..];

    let at_idx = rest.find('@');
    let userinfo = at_idx.map(|i| rest[..i].to_string()).unwrap_or_default();
    let host_part = at_idx.map(|i| &rest[i + 1..]).unwrap_or(rest);

    let q_idx = host_part.find('?');
    let host_port = q_idx.map(|i| &host_part[..i]).unwrap_or(host_part);
    let query_str = q_idx.map(|i| &host_part[i + 1..]).unwrap_or("");

    let last_colon = host_port.rfind(':')?;
    let host = host_port[..last_colon].to_string();
    let port: u16 = host_port[last_colon + 1..].parse().unwrap_or(443);

    let mut params = std::collections::HashMap::new();
    for pair in query_str.split('&') {
        if let Some((k, v)) = pair.split_once('=') {
            params.insert(
                k.to_string(),
                urlencoding::decode(v).unwrap_or_default().to_string(),
            );
        }
    }

    Some((userinfo, host, port, params, fragment))
}

fn make_tls_config(params: &std::collections::HashMap<String, String>, default_sni: &str) -> Value {
    let security = params.get("security").map(|s| s.as_str()).unwrap_or("");
    let is_reality = security == "reality";
    let enabled = security != "none";

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
    serde_json::json!({ "type": transport_type })
}

fn infer_country(name: &str) -> (String, String) {
    let patterns: &[(&[&str], &str, &str)] = &[
        (&["HK", "Hong Kong", "香港"], "Hong Kong", "HK"),
        (
            &["JP", "Japan", "日本", "东京", "Tokyo", "Osaka", "大阪"],
            "Japan",
            "JP",
        ),
        (
            &[
                "US",
                "USA",
                "United States",
                "美国",
                "Los Angeles",
                "San Jose",
                "Seattle",
            ],
            "United States",
            "US",
        ),
        (&["SG", "Singapore", "新加坡"], "Singapore", "SG"),
        (
            &["KR", "Korea", "韩国", "首尔", "Seoul"],
            "South Korea",
            "KR",
        ),
        (&["TW", "Taiwan", "台湾"], "Taiwan", "TW"),
        (&["DE", "Germany", "德国"], "Germany", "DE"),
        (
            &["GB", "UK", "United Kingdom", "英国", "London"],
            "United Kingdom",
            "GB",
        ),
        (&["FR", "France", "法国"], "France", "FR"),
        (&["AU", "Australia", "澳大利亚"], "Australia", "AU"),
        (&["CA", "Canada", "加拿大"], "Canada", "CA"),
        (&["IN", "India", "印度"], "India", "IN"),
        (&["RU", "Russia", "俄罗斯"], "Russia", "RU"),
        (&["NL", "Netherlands", "荷兰"], "Netherlands", "NL"),
        (&["TR", "Turkey", "土耳其"], "Turkey", "TR"),
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
    let decoded = base64::engine::general_purpose::STANDARD
        .decode(b64)
        .or_else(|_| base64::engine::general_purpose::STANDARD_NO_PAD.decode(b64))
        .ok()?;
    let json: Value = serde_json::from_slice(&decoded).ok()?;

    let name = json["ps"].as_str().unwrap_or("VMess Node").to_string();
    let server = json["add"].as_str()?.to_string();
    let port = json["port"]
        .as_str()
        .and_then(|p| p.parse().ok())
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
        name,
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
    let name = if fragment.is_empty() {
        "VLESS Node".to_string()
    } else {
        fragment
    };
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
        name,
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
    let name = if fragment.is_empty() {
        "Trojan Node".to_string()
    } else {
        fragment
    };
    let (country, country_code) = infer_country(&name);
    let password = urlencoding::decode(&password)
        .unwrap_or_default()
        .to_string();

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
        name,
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
    let fragment = hash_idx
        .map(|i| {
            urlencoding::decode(&uri[i + 1..])
                .unwrap_or_default()
                .to_string()
        })
        .unwrap_or_default();
    let without_fragment = hash_idx.map(|i| &uri[..i]).unwrap_or(uri);
    let content = &without_fragment[5..]; // remove "ss://"

    let (method, password, server, port);

    if content.contains('@') {
        let at_idx = content.find('@')?;
        let user_part = &content[..at_idx];
        let host_part = &content[at_idx + 1..];

        let decoded = base64::engine::general_purpose::STANDARD
            .decode(user_part)
            .or_else(|_| base64::engine::general_purpose::STANDARD_NO_PAD.decode(user_part))
            .ok()
            .and_then(|b| String::from_utf8(b).ok())
            .unwrap_or_else(|| {
                urlencoding::decode(user_part)
                    .unwrap_or_default()
                    .to_string()
            });

        let colon_idx = decoded.find(':')?;
        method = decoded[..colon_idx].to_string();
        password = decoded[colon_idx + 1..].to_string();

        let last_colon = host_part.rfind(':')?;
        server = host_part[..last_colon].to_string();
        port = host_part[last_colon + 1..].parse().unwrap_or(443);
    } else {
        let decoded = base64::engine::general_purpose::STANDARD
            .decode(content)
            .or_else(|_| base64::engine::general_purpose::STANDARD_NO_PAD.decode(content))
            .ok()
            .and_then(|b| String::from_utf8(b).ok())
            .unwrap_or_else(|| content.to_string());

        let at_idx = decoded.find('@')?;
        let user_part = &decoded[..at_idx];
        let host_part = &decoded[at_idx + 1..];

        let colon_idx = user_part.find(':')?;
        method = user_part[..colon_idx].to_string();
        password = user_part[colon_idx + 1..].to_string();

        let last_colon = host_part.rfind(':')?;
        server = host_part[..last_colon].to_string();
        port = host_part[last_colon + 1..].parse().unwrap_or(443);
    }

    let name = if fragment.is_empty() {
        "SS Node".to_string()
    } else {
        fragment
    };
    let (country, country_code) = infer_country(&name);

    let config = serde_json::json!({
        "type": "shadowsocks",
        "password": password,
        "method": method,
    });

    Some(ProxyNode {
        id: name.clone(),
        name,
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
    let name = if fragment.is_empty() {
        "Hysteria2 Node".to_string()
    } else {
        fragment
    };
    let (country, country_code) = infer_country(&name);
    let password = urlencoding::decode(&password)
        .unwrap_or_default()
        .to_string();

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
        name,
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
    let name = if fragment.is_empty() {
        "TUIC Node".to_string()
    } else {
        fragment
    };
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
        name,
        server: host,
        port,
        protocol: "TUIC".to_string(),
        country,
        country_code,
        protocol_config: Some(config),
    })
}

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

pub async fn fetch_subscription(url: &str) -> Result<FetchResult, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .danger_accept_invalid_certs(true)
        .build()
        .map_err(|e| format!("failed to create HTTP client: {}", e))?;

    let response = client
        .get(url)
        .header("User-Agent", "Calamity/1.0")
        .send()
        .await
        .map_err(|e| format!("failed to fetch subscription: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("subscription returned HTTP {}", response.status()));
    }

    let user_info = response
        .headers()
        .get("subscription-userinfo")
        .and_then(|v| v.to_str().ok())
        .map(parse_userinfo);

    let body = response
        .text()
        .await
        .map_err(|e| format!("failed to read response body: {}", e))?;

    // Try base64 decode first, fall back to raw text
    let decoded = base64::engine::general_purpose::STANDARD
        .decode(body.trim())
        .or_else(|_| base64::engine::general_purpose::STANDARD_NO_PAD.decode(body.trim()))
        .and_then(|b| String::from_utf8(b).map_err(|_| base64::DecodeError::InvalidByte(0, 0)))
        .unwrap_or_else(|_| body.clone());

    let nodes: Vec<ProxyNode> = decoded.lines().filter_map(parse_v2ray_uri).collect();

    Ok(FetchResult { nodes, user_info })
}
