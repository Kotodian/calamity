use std::sync::Arc;
use tauri::{AppHandle, Manager};

use crate::singbox::process::SingboxProcess;
use crate::singbox::storage;
use crate::singbox::tailscale_api;
use crate::singbox::tailscale_config;
use crate::singbox::tailscale_storage::{self, TailscaleSettings};

#[tauri::command]
pub async fn tailscale_get_settings() -> Result<TailscaleSettings, String> {
    Ok(tailscale_storage::load_tailscale_settings())
}

#[tauri::command]
pub async fn tailscale_save_settings(
    app: AppHandle,
    mut settings: TailscaleSettings,
) -> Result<(), String> {
    // Auto-create auth key via OAuth if not manually provided
    if settings.enabled
        && settings.auth_key.is_empty()
        && !settings.oauth_client_id.is_empty()
        && !settings.oauth_client_secret.is_empty()
    {
        let key = tailscale_api::create_auth_key(&mut settings).await?;
        settings.auth_key = key;
    }
    // Fix root-owned tailscale state directory from previous TUN runs
    fix_tailscale_state_permissions();
    tailscale_storage::save_tailscale_settings(&settings)?;
    tailscale_config::write_tailscale_config()?;
    reload_singbox(&app).await;
    Ok(())
}

/// Fix permissions on root-owned files left by previous TUN-mode (sudo) runs.
fn fix_tailscale_state_permissions() {
    let paths = [
        tailscale_config::tailscale_state_dir(),
        storage::app_data_dir().join("singbox-tun.log"),
    ];
    for path in &paths {
        if path.exists() {
            // Use sudo -n to chown back to current user (non-interactive, won't prompt)
            if let Ok(user) = std::env::var("USER") {
                let _ = std::process::Command::new("sudo")
                    .args(["-n", "chown", "-R", &user, &path.to_string_lossy()])
                    .output();
            }
        }
    }
}

#[tauri::command]
pub async fn tailscale_get_devices() -> Result<Vec<tailscale_api::TailscaleDevice>, String> {
    let mut settings = tailscale_storage::load_tailscale_settings();
    tailscale_api::fetch_devices(&mut settings).await
}

#[tauri::command]
pub async fn tailscale_set_exit_node(app: AppHandle, exit_node: String) -> Result<(), String> {
    let mut settings = tailscale_storage::load_tailscale_settings();
    settings.exit_node = exit_node;
    tailscale_storage::save_tailscale_settings(&settings)?;
    tailscale_config::write_tailscale_config()?;
    reload_singbox(&app).await;
    Ok(())
}

#[tauri::command]
pub async fn tailscale_test_oauth(
    client_id: String,
    client_secret: String,
) -> Result<String, String> {
    let mut settings = TailscaleSettings {
        oauth_client_id: client_id,
        oauth_client_secret: client_secret,
        ..Default::default()
    };
    let _token = tailscale_api::get_oauth_token(&mut settings).await?;
    Ok(format!(
        "OAuth token obtained, expires: {}",
        settings.oauth_token_expires
    ))
}

async fn reload_singbox(app: &AppHandle) {
    let process = app.state::<Arc<SingboxProcess>>().inner().clone();
    if process.is_running().await {
        let settings = storage::load_settings();
        let _ = process.reload(&settings).await;
    }
}
