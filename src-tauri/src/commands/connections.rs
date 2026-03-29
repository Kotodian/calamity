use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};

use crate::singbox::process::SingboxProcess;

/// Subscribe to real-time connections data. Emits "connections-update" events every ~1 second.
/// Each event contains the full snapshot from /connections API.
#[tauri::command]
pub async fn subscribe_connections(app: AppHandle) -> Result<(), String> {
    let process = app.state::<Arc<SingboxProcess>>().inner().clone();

    tokio::spawn(async move {
        loop {
            match process.api().get_connections().await {
                Ok(val) => {
                    let _ = app.emit("connections-update", val);
                }
                Err(_) => {
                    // sing-box not running, emit empty
                    let _ = app.emit("connections-update", serde_json::json!({
                        "connections": [],
                        "uploadTotal": 0,
                        "downloadTotal": 0,
                        "memory": 0
                    }));
                }
            }
            tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn close_connection(app: AppHandle, id: String) -> Result<(), String> {
    let process = app.state::<Arc<SingboxProcess>>().inner().clone();
    process.api().close_connection(&id).await
}

#[tauri::command]
pub async fn close_all_connections(app: AppHandle) -> Result<(), String> {
    let process = app.state::<Arc<SingboxProcess>>().inner().clone();
    process.api().close_all_connections().await
}
