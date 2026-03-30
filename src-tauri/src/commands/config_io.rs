use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};

use crate::singbox::config_io;
use crate::singbox::process::SingboxProcess;
use crate::singbox::storage;

#[tauri::command]
pub async fn export_config(path: String) -> Result<(), String> {
    let backup = config_io::export_backup();
    let content = serde_json::to_string_pretty(&backup).map_err(|e| e.to_string())?;
    std::fs::write(&path, content).map_err(|e| format!("Failed to write file: {}", e))
}

#[tauri::command]
pub async fn import_config(
    app: AppHandle,
    path: String,
) -> Result<config_io::ImportResult, String> {
    let content =
        std::fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {}", e))?;
    let result = config_io::import_config(&content)?;

    // Restart sing-box if running to pick up new config
    let process = app.state::<Arc<SingboxProcess>>().inner().clone();
    if process.is_running().await {
        let settings = storage::load_settings();
        let _ = process.restart(&settings).await;
        let _ = app.emit("singbox-restarted", ());
    }

    // Notify all windows that settings changed
    let _ = app.emit("settings-changed", ());

    Ok(result)
}
