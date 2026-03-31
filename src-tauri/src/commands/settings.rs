use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_autostart::AutoLaunchManager;

use crate::singbox::process::SingboxProcess;
use crate::singbox::storage::{self, AppSettings};

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TunRuntimeStatus {
    pub running: bool,
    pub mode: String,
    pub target_enhanced_mode: bool,
    pub requires_admin: bool,
    pub last_error: Option<String>,
    pub effective_dns_mode: Option<String>,
}

#[tauri::command]
pub async fn get_settings() -> Result<AppSettings, String> {
    Ok(storage::load_settings())
}

#[tauri::command]
pub async fn get_tun_status(app: AppHandle) -> Result<TunRuntimeStatus, String> {
    let process = app.state::<Arc<SingboxProcess>>().inner().clone();
    let settings = storage::load_settings();
    Ok(process.tun_status(&settings).await)
}

#[tauri::command]
pub async fn update_settings(
    app: AppHandle,
    updates: serde_json::Value,
) -> Result<AppSettings, String> {
    let mut settings = storage::load_settings();
    let old_key = restart_key(&settings);
    let old_system_proxy = settings.system_proxy;

    settings = merge_settings_updates(&settings, &updates)?;

    storage::save_settings(&settings)?;

    // Handle auto start toggle
    if let Some(auto_start) = updates.get("autoStart").and_then(|v| v.as_bool()) {
        if let Some(manager) = app.try_state::<AutoLaunchManager>() {
            let _ = if auto_start {
                manager.enable()
            } else {
                manager.disable()
            };
        }
    }

    // Handle system proxy toggle
    if settings.system_proxy != old_system_proxy {
        if settings.system_proxy {
            set_system_proxy(settings.http_port, settings.socks_port);
        } else {
            clear_system_proxy();
        }
    }

    // Reload or restart sing-box depending on what changed
    let new_key = restart_key(&settings);
    let process = app.state::<Arc<SingboxProcess>>().inner().clone();
    let is_running = process.is_running().await;

    if !is_running {
        // Not running — don't auto-start, user clicks connect
    } else if old_key != new_key {
        // Critical settings changed (ports, TUN mode, etc.) — must restart
        match process.restart(&settings).await {
            Ok(()) => { let _ = app.emit("singbox-restarted", ()); }
            Err(e) => { let _ = app.emit("singbox-error", &e); }
        }
    } else {
        // Non-critical change — hot-reload via SIGHUP
        match process.reload(&settings).await {
            Ok(()) => { let _ = app.emit("singbox-restarted", ()); }
            Err(e) => { let _ = app.emit("singbox-error", &e); }
        }
    }

    // Broadcast settings change to all windows
    let _ = app.emit("settings-changed", ());
    crate::commands::connection::emit_connection_state_changed(&app).await;

    Ok(settings)
}

fn restart_key(s: &AppSettings) -> String {
    format!(
        "{}:{}:{}:{}:{}:{}:{}:{}:{}:{}:{}",
        s.mixed_port,
        s.http_port,
        s.socks_port,
        s.log_level,
        s.allow_lan,
        s.enhanced_mode,
        s.tun_config.stack,
        s.tun_config.mtu,
        s.tun_config.auto_route,
        s.tun_config.strict_route,
        s.tun_config.dns_hijack.join(","),
    )
}

fn merge_settings_updates(
    current: &AppSettings,
    updates: &serde_json::Value,
) -> Result<AppSettings, String> {
    let mut json = serde_json::to_value(current).map_err(|e| e.to_string())?;
    if let (Some(base), Some(patch)) = (json.as_object_mut(), updates.as_object()) {
        for (k, v) in patch {
            base.insert(k.clone(), v.clone());
        }
    }

    let mut settings: AppSettings = serde_json::from_value(json).map_err(|e| e.to_string())?;
    if settings.enhanced_mode {
        settings.system_proxy = false;
    }

    Ok(settings)
}

/// Get active network services (e.g. "Wi-Fi", "Ethernet").
/// Returns all services that have an IP address assigned.
fn get_active_network_services() -> Vec<String> {
    let output = match std::process::Command::new("networksetup")
        .args(["-listallnetworkservices"])
        .output()
    {
        Ok(o) if o.status.success() => o,
        _ => return vec![],
    };

    let text = String::from_utf8_lossy(&output.stdout);
    let mut services = Vec::new();

    for line in text.lines().skip(1) {
        // Skip disabled services (prefixed with *)
        let name = line.trim();
        if name.is_empty() || name.starts_with('*') {
            continue;
        }
        // Check if this service has an IP (is active)
        if let Ok(info) = std::process::Command::new("networksetup")
            .args(["-getinfo", name])
            .output()
        {
            let info_text = String::from_utf8_lossy(&info.stdout);
            // Has a real IP address (not empty or "none")
            let has_ip = info_text
                .lines()
                .any(|l| l.starts_with("IP address:") && !l.contains("none") && l.len() > 12);
            if has_ip {
                services.push(name.to_string());
            }
        }
    }
    services
}

pub fn set_system_proxy_ports(http_port: u16, socks_port: u16) {
    set_system_proxy(http_port, socks_port);
}

fn set_system_proxy(http_port: u16, socks_port: u16) {
    let services = get_active_network_services();
    if services.is_empty() {
        eprintln!("[system-proxy] no active network services found");
        return;
    }

    let http_str = http_port.to_string();
    let socks_str = socks_port.to_string();

    for service in &services {
        eprintln!("[system-proxy] setting proxy on: {}", service);
        let cmds: Vec<Vec<&str>> = vec![
            vec!["-setwebproxy", service, "127.0.0.1", &http_str],
            vec!["-setwebproxystate", service, "on"],
            vec!["-setsecurewebproxy", service, "127.0.0.1", &http_str],
            vec!["-setsecurewebproxystate", service, "on"],
            vec!["-setsocksfirewallproxy", service, "127.0.0.1", &socks_str],
            vec!["-setsocksfirewallproxystate", service, "on"],
        ];
        for args in &cmds {
            let _ = std::process::Command::new("networksetup")
                .args(args)
                .output();
        }
    }
}

fn clear_system_proxy() {
    let services = get_active_network_services();
    if services.is_empty() {
        eprintln!("[system-proxy] no active network services found");
        return;
    }

    for service in &services {
        eprintln!("[system-proxy] clearing proxy on: {}", service);
        let cmds: Vec<Vec<&str>> = vec![
            vec!["-setwebproxystate", service, "off"],
            vec!["-setsecurewebproxystate", service, "off"],
            vec!["-setsocksfirewallproxystate", service, "off"],
        ];
        for args in &cmds {
            let _ = std::process::Command::new("networksetup")
                .args(args)
                .output();
        }
    }
}

#[tauri::command]
pub async fn install_tun_sudoers(app: AppHandle) -> Result<bool, String> {
    let process = app.state::<Arc<SingboxProcess>>().inner().clone();
    let raw_path = process.singbox_path();
    let resolved_path = resolve_singbox_path(raw_path);

    // Include both the symlink and resolved paths so sudo matches either
    // Only add fully-qualified paths (sudoers rejects bare command names)
    let mut paths = vec![resolved_path.clone()];
    if raw_path != resolved_path && raw_path.starts_with('/') {
        paths.push(raw_path.to_string());
    }
    paths.push("/bin/kill".to_string());
    paths.push("/usr/bin/kill".to_string());

    let sudoers_line = format!(
        "{user} ALL=(root) NOPASSWD: {cmds}\n",
        user = whoami(),
        cmds = paths.join(", ")
    );
    let sudoers_file = "/etc/sudoers.d/calamity-tun";

    // Write sudoers file via osascript (needs one-time admin auth)
    let script = format!(
        "do shell script \"echo '{}' > {} && chmod 0440 {}\" with administrator privileges",
        escape_applescript_string(&sudoers_line),
        sudoers_file,
        sudoers_file,
    );

    let output = tokio::process::Command::new("osascript")
        .arg("-e")
        .arg(script)
        .output()
        .await
        .map_err(|e| format!("failed to install sudoers: {}", e))?;

    if output.status.success() {
        Ok(true)
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if stderr.contains("User canceled") || stderr.contains("(-128)") {
            Ok(false)
        } else {
            Err(format!("failed to install sudoers: {}", stderr.trim()))
        }
    }
}

#[tauri::command]
pub async fn check_tun_sudoers(app: AppHandle) -> Result<bool, String> {
    let process = app.state::<Arc<SingboxProcess>>().inner().clone();
    let raw_path = process.singbox_path();
    let resolved_path = resolve_singbox_path(raw_path);
    // Try resolved path first (what sudoers has), then raw path
    for path in [&resolved_path, &raw_path.to_string()] {
        let output = tokio::process::Command::new("sudo")
            .args(["-n", path.as_str(), "version"])
            .output()
            .await
            .map_err(|e| e.to_string())?;
        if output.status.success() {
            return Ok(true);
        }
    }
    Ok(false)
}

fn whoami() -> String {
    std::env::var("USER")
        .or_else(|_| std::env::var("LOGNAME"))
        .unwrap_or_else(|_| "root".to_string())
}

fn resolve_singbox_path(path: &str) -> String {
    // Try direct canonicalize first (works for absolute/relative paths)
    if let Ok(resolved) = std::fs::canonicalize(path) {
        return resolved.to_string_lossy().to_string();
    }
    // For bare command names like "sing-box", use `which` to find full path
    if let Ok(output) = std::process::Command::new("which").arg(path).output() {
        if output.status.success() {
            let which_path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !which_path.is_empty() {
                // Resolve symlinks on the which result
                return std::fs::canonicalize(&which_path)
                    .map(|p| p.to_string_lossy().to_string())
                    .unwrap_or(which_path);
            }
        }
    }
    path.to_string()
}

fn escape_applescript_string(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}

/// Set system proxy on startup if enabled, clear on exit.
pub fn apply_system_proxy_on_start(settings: &AppSettings) {
    if settings.system_proxy {
        set_system_proxy(settings.http_port, settings.socks_port);
    }
}

pub fn clear_system_proxy_on_exit() {
    clear_system_proxy();
}

#[cfg(test)]
mod tests {
    use super::{merge_settings_updates, restart_key};
    use crate::singbox::storage::AppSettings;
    use serde_json::json;

    #[test]
    fn restart_key_changes_when_enhanced_mode_changes() {
        let mut settings = AppSettings::default();
        let normal = restart_key(&settings);
        settings.enhanced_mode = true;

        assert_ne!(normal, restart_key(&settings));
    }

    #[test]
    fn restart_key_changes_when_tun_config_changes() {
        let mut settings = AppSettings::default();
        let base = restart_key(&settings);
        settings.tun_config.mtu = 1500;

        assert_ne!(base, restart_key(&settings));
    }

    #[test]
    fn restart_key_changes_when_dns_hijack_changes() {
        let mut settings = AppSettings::default();
        let base = restart_key(&settings);
        settings.tun_config.dns_hijack = vec!["198.18.0.3:53".to_string()];

        assert_ne!(base, restart_key(&settings));
    }

    #[test]
    fn enabling_tun_forces_system_proxy_off() {
        let current = AppSettings::default();
        let merged = merge_settings_updates(
            &current,
            &json!({
                "enhancedMode": true,
                "systemProxy": true
            }),
        )
        .expect("settings merge should succeed");

        assert!(merged.enhanced_mode);
        assert!(!merged.system_proxy);
    }
}
