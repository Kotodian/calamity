use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::process::Command;

/// Find the tailscale CLI binary path.
/// Tries `which tailscale` first, then macOS default path.
pub fn find_tailscale() -> Result<String, String> {
    // Try PATH first
    if let Ok(output) = Command::new("which").arg("tailscale").output() {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path.is_empty() {
                return Ok(path);
            }
        }
    }

    // Try macOS default path
    let macos_path = "/Applications/Tailscale.app/Contents/MacOS/Tailscale";
    if std::path::Path::new(macos_path).exists() {
        return Ok(macos_path.to_string());
    }

    Err(
        "Tailscale not found. Please install Tailscale from https://tailscale.com/download"
            .to_string(),
    )
}

fn run_tailscale(args: &[&str]) -> Result<String, String> {
    let bin = find_tailscale()?;
    let output = Command::new(&bin)
        .args(args)
        .output()
        .map_err(|e| format!("failed to run tailscale: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(format!("tailscale error: {}", stderr.trim()));
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

// ---- Data types matching tailscale status --json ----

#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct TsStatus {
    #[serde(rename = "Self")]
    self_node: TsNode,
    peer: Option<std::collections::HashMap<String, TsNode>>,
    backend_state: String,
    current_tailnet: Option<TsCurrentTailnet>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct TsNode {
    #[serde(rename = "ID")]
    id: String,
    host_name: String,
    #[serde(rename = "DNSName")]
    dns_name: String,
    #[serde(rename = "OS")]
    os: String,
    #[serde(rename = "TailscaleIPs")]
    tailscale_ips: Option<Vec<String>>,
    online: Option<bool>,
    exit_node: Option<bool>,
    exit_node_option: Option<bool>,
    last_seen: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct TsCurrentTailnet {
    name: String,
    #[serde(rename = "MagicDNSSuffix")]
    magic_dns_suffix: String,
}

// ---- Output types for frontend ----

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TailscaleStatus {
    pub account: TailscaleAccount,
    pub devices: Vec<TailscaleDevice>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TailscaleAccount {
    pub login_name: String,
    pub tailnet_name: String,
    pub logged_in: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TailscaleDevice {
    pub id: String,
    pub name: String,
    pub hostname: String,
    pub ip: String,
    pub os: String,
    pub status: String, // "online" | "offline"
    pub last_seen: String,
    pub is_exit_node: bool,
    pub is_current_exit_node: bool,
    pub is_self: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FunnelEntry {
    pub id: String,
    pub local_port: u16,
    pub protocol: String,
    pub public_url: String,
    pub enabled: bool,
    pub allow_public: bool,
}

fn dns_name_to_display(dns_name: &str, suffix: &str) -> String {
    // "huawei-matebook-x.tail47feb.ts.net." → "huawei-matebook-x"
    let trimmed = dns_name.trim_end_matches('.');
    let without_suffix = trimmed
        .strip_suffix(&format!(".{}", suffix))
        .unwrap_or(trimmed);
    without_suffix.to_string()
}

fn map_node(node: &TsNode, suffix: &str, is_self: bool) -> TailscaleDevice {
    let online = node.online.unwrap_or(false);
    let ip = node
        .tailscale_ips
        .as_ref()
        .and_then(|ips| ips.first().cloned())
        .unwrap_or_default();
    let last_seen = node
        .last_seen
        .clone()
        .unwrap_or_else(|| chrono::Utc::now().to_rfc3339());

    TailscaleDevice {
        id: node.id.clone(),
        name: dns_name_to_display(&node.dns_name, suffix),
        hostname: node.host_name.clone(),
        ip,
        os: node.os.clone(),
        status: if online { "online" } else { "offline" }.to_string(),
        last_seen,
        is_exit_node: node.exit_node_option.unwrap_or(false),
        is_current_exit_node: node.exit_node.unwrap_or(false),
        is_self,
    }
}

// ---- Public API ----

pub fn get_status() -> Result<TailscaleStatus, String> {
    let output = run_tailscale(&["status", "--json"])?;
    let ts: TsStatus = serde_json::from_str(&output)
        .map_err(|e| format!("failed to parse tailscale status: {}", e))?;

    let logged_in = ts.backend_state == "Running";
    let tailnet = ts.current_tailnet.as_ref();
    let suffix = tailnet.map(|t| t.magic_dns_suffix.as_str()).unwrap_or("");

    let account = TailscaleAccount {
        login_name: tailnet.map(|t| t.name.clone()).unwrap_or_default(),
        tailnet_name: suffix.to_string(),
        logged_in,
    };

    let mut devices = Vec::new();
    devices.push(map_node(&ts.self_node, suffix, true));

    if let Some(peers) = &ts.peer {
        for node in peers.values() {
            devices.push(map_node(node, suffix, false));
        }
    }

    Ok(TailscaleStatus { account, devices })
}

pub fn login() -> Result<String, String> {
    let bin = find_tailscale()?;
    // tailscale login outputs auth URL to stderr
    let output = Command::new(&bin)
        .arg("login")
        .output()
        .map_err(|e| format!("failed to run tailscale login: {}", e))?;

    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    // Try to extract URL from output
    for line in stderr.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
            // Open in browser
            let _ = Command::new("open").arg(trimmed).spawn();
            return Ok(trimmed.to_string());
        }
    }

    // If already logged in, no URL needed
    if output.status.success() {
        return Ok("Already logged in".to_string());
    }

    Err(format!("tailscale login failed: {}", stderr.trim()))
}

pub fn logout() -> Result<(), String> {
    run_tailscale(&["logout"])?;
    Ok(())
}

pub fn set_exit_node(ip: &str) -> Result<(), String> {
    if ip.is_empty() {
        run_tailscale(&["set", "--exit-node="])?;
    } else {
        run_tailscale(&["set", &format!("--exit-node={}", ip)])?;
    }
    Ok(())
}

pub fn get_serve_status() -> Result<Vec<FunnelEntry>, String> {
    let output = run_tailscale(&["serve", "status", "--json"])?;
    let status: Value = serde_json::from_str(&output)
        .map_err(|e| format!("failed to parse serve status: {}", e))?;

    let mut entries = Vec::new();
    let allow_funnel = status.get("AllowFunnel").and_then(|v| v.as_object());

    // Parse Web entries (HTTPS)
    if let Some(web) = status.get("Web").and_then(|v| v.as_object()) {
        for (public_addr, handlers_val) in web {
            if let Some(handlers) = handlers_val.get("Handlers").and_then(|v| v.as_object()) {
                for (_path, handler) in handlers {
                    if let Some(proxy) = handler.get("Proxy").and_then(|v| v.as_str()) {
                        // Extract port from proxy URL like "http://127.0.0.1:3000"
                        let port = proxy
                            .rsplit(':')
                            .next()
                            .and_then(|p| p.parse::<u16>().ok())
                            .unwrap_or(0);

                        let is_funnel = allow_funnel
                            .and_then(|af| af.get(public_addr))
                            .and_then(|v| v.as_bool())
                            .unwrap_or(false);

                        let public_url =
                            format!("https://{}", public_addr.trim_end_matches(":443"));

                        entries.push(FunnelEntry {
                            id: format!("web-{}", port),
                            local_port: port,
                            protocol: "https".to_string(),
                            public_url,
                            enabled: true,
                            allow_public: is_funnel,
                        });
                    }
                }
            }
        }
    }

    // Parse TCP entries
    if let Some(tcp) = status.get("TCP").and_then(|v| v.as_object()) {
        for (port_str, _config) in tcp {
            if let Ok(port) = port_str.parse::<u16>() {
                let is_funnel = allow_funnel
                    .and_then(|af| af.get(port_str))
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);

                entries.push(FunnelEntry {
                    id: format!("tcp-{}", port),
                    local_port: port,
                    protocol: "tcp".to_string(),
                    public_url: format!("tcp://{}:{}", "", port),
                    enabled: true,
                    allow_public: is_funnel,
                });
            }
        }
    }

    Ok(entries)
}

pub fn add_funnel(port: u16, allow_public: bool) -> Result<(), String> {
    if allow_public {
        run_tailscale(&["funnel", &port.to_string()])?;
    } else {
        run_tailscale(&["serve", &port.to_string()])?;
    }
    Ok(())
}

pub fn remove_funnel(port: u16) -> Result<(), String> {
    // Try funnel off first, then serve off
    let _ = run_tailscale(&["funnel", &port.to_string(), "off"]);
    let _ = run_tailscale(&["serve", &port.to_string(), "off"]);
    Ok(())
}
