use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};

use crate::singbox::dns_storage::{self, DnsRuleConfig, DnsServerConfig, DnsSettings};
use crate::singbox::process::SingboxProcess;
use crate::singbox::storage;

#[tauri::command]
pub async fn get_dns_settings() -> Result<DnsSettings, String> {
    Ok(dns_storage::load_dns_settings())
}

#[tauri::command]
pub async fn update_dns_config(
    app: AppHandle,
    mode: Option<String>,
    final_server: Option<String>,
    fake_ip_range: Option<String>,
) -> Result<DnsSettings, String> {
    let mut settings = dns_storage::load_dns_settings();
    if let Some(m) = mode {
        settings.mode = m;
    }
    if let Some(f) = final_server {
        settings.final_server = f;
    }
    if let Some(r) = fake_ip_range {
        settings.fake_ip_range = r;
    }
    dns_storage::save_dns_settings(&settings)?;
    restart_singbox(&app).await;
    Ok(settings)
}

#[tauri::command]
pub async fn add_dns_server(
    app: AppHandle,
    server: DnsServerConfig,
) -> Result<DnsSettings, String> {
    let mut settings = dns_storage::load_dns_settings();
    settings.servers.push(server);
    dns_storage::save_dns_settings(&settings)?;
    restart_singbox(&app).await;
    Ok(settings)
}

#[tauri::command]
pub async fn update_dns_server(
    app: AppHandle,
    server: DnsServerConfig,
) -> Result<DnsSettings, String> {
    let mut settings = dns_storage::load_dns_settings();
    if let Some(s) = settings.servers.iter_mut().find(|s| s.id == server.id) {
        *s = server;
    }
    dns_storage::save_dns_settings(&settings)?;
    restart_singbox(&app).await;
    Ok(settings)
}

#[tauri::command]
pub async fn delete_dns_server(
    app: AppHandle,
    id: String,
) -> Result<DnsSettings, String> {
    let mut settings = dns_storage::load_dns_settings();
    settings.servers.retain(|s| s.id != id);
    settings.rules.retain(|r| r.server != id);
    dns_storage::save_dns_settings(&settings)?;
    restart_singbox(&app).await;
    Ok(settings)
}

#[tauri::command]
pub async fn add_dns_rule(
    app: AppHandle,
    rule: DnsRuleConfig,
) -> Result<DnsSettings, String> {
    let mut settings = dns_storage::load_dns_settings();
    settings.rules.push(rule);
    dns_storage::save_dns_settings(&settings)?;
    restart_singbox(&app).await;
    Ok(settings)
}

#[tauri::command]
pub async fn delete_dns_rule(
    app: AppHandle,
    id: String,
) -> Result<DnsSettings, String> {
    let mut settings = dns_storage::load_dns_settings();
    settings.rules.retain(|r| r.id != id);
    dns_storage::save_dns_settings(&settings)?;
    restart_singbox(&app).await;
    Ok(settings)
}

async fn restart_singbox(app: &AppHandle) {
    let process = app.state::<Arc<SingboxProcess>>().inner().clone();
    let app_settings = storage::load_settings();
    match process.restart(&app_settings).await {
        Ok(()) => {
            eprintln!("[dns] sing-box restarted successfully");
            let _ = app.emit("singbox-restarted", ());
        }
        Err(e) => {
            eprintln!("[dns] sing-box restart failed: {}", e);
            let _ = app.emit("singbox-error", &e);
        }
    }
}
