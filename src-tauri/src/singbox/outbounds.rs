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

    out["tag"] = json!(node.name);
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
    Some(json!({
        "type": "shadowsocks",
        "server": node.server,
        "server_port": node.port,
        "password": c.get("password")?.as_str()?,
        "method": c.get("method")?.as_str()?,
    }))
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
    let obfs_type = c
        .get("obfsType")
        .and_then(|v| v.as_str())
        .unwrap_or("");
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
    Some(json!({
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
    }))
}

fn apply_tls(out: &mut Value, c: &serde_json::Map<String, Value>) {
    let tls = match c.get("tls").and_then(|v| v.as_object()) {
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

    let mut tls_obj = json!({ "enabled": true });

    let sni = tls.get("sni").and_then(|v| v.as_str()).unwrap_or("");
    if !sni.is_empty() {
        tls_obj["server_name"] = json!(sni);
    }

    if let Some(alpn) = tls.get("alpn").and_then(|v| v.as_array()) {
        if !alpn.is_empty() {
            tls_obj["alpn"] = json!(alpn);
        }
    }

    if tls
        .get("insecure")
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
    {
        tls_obj["insecure"] = json!(true);
    }

    if tls
        .get("reality")
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
    {
        let pub_key = tls
            .get("realityPublicKey")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let short_id = tls
            .get("realityShortId")
            .and_then(|v| v.as_str())
            .unwrap_or("");
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
    let t_type = transport
        .get("type")
        .and_then(|v| v.as_str())
        .unwrap_or("tcp");
    if t_type == "tcp" {
        return;
    }

    let mut t_obj = json!({ "type": t_type });

    match t_type {
        "ws" => {
            let path = transport
                .get("wsPath")
                .and_then(|v| v.as_str())
                .unwrap_or("/");
            t_obj["path"] = json!(path);
            if let Some(headers) = transport.get("wsHeaders").and_then(|v| v.as_object()) {
                if !headers.is_empty() {
                    t_obj["headers"] = json!(headers);
                }
            }
        }
        "grpc" => {
            let sn = transport
                .get("grpcServiceName")
                .and_then(|v| v.as_str())
                .unwrap_or("");
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
        "url": "http://cp.cloudflare.com/generate_204",
        "tolerance": 50,
        "interrupt_exist_connections": false,
    })
}
