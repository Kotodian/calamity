use std::sync::Arc;
use serde::Serialize;
use tauri::{AppHandle, Manager};

use crate::singbox::process::SingboxProcess;
use crate::singbox::storage;

#[derive(Clone, Serialize)]
pub struct SingboxStatus {
    pub running: bool,
    pub version: String,
}

#[tauri::command]
pub async fn singbox_start(app: AppHandle) -> Result<(), String> {
    let process = app.state::<Arc<SingboxProcess>>().inner().clone();
    let settings = storage::load_settings();
    process.start(&settings).await
}

#[tauri::command]
pub async fn singbox_stop(app: AppHandle) -> Result<(), String> {
    let process = app.state::<Arc<SingboxProcess>>().inner().clone();
    process.stop().await
}

#[tauri::command]
pub async fn singbox_restart(app: AppHandle) -> Result<(), String> {
    let process = app.state::<Arc<SingboxProcess>>().inner().clone();
    let settings = storage::load_settings();
    process.restart(&settings).await
}

#[tauri::command]
pub async fn singbox_status(app: AppHandle) -> Result<SingboxStatus, String> {
    let process = app.state::<Arc<SingboxProcess>>().inner().clone();
    let running = process.is_running().await;
    let version = if running {
        process.api().version().await.map(|v| v.version).unwrap_or_else(|_| "unknown".to_string())
    } else {
        "not running".to_string()
    };
    Ok(SingboxStatus { running, version })
}
