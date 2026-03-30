use serde::Serialize;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};

use crate::singbox::process::SingboxProcess;

#[derive(Clone, Serialize)]
pub struct TrafficEvent {
    pub up: u64,
    pub down: u64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardInfo {
    pub running: bool,
    pub version: String,
    pub active_connections: usize,
    pub upload_total: u64,
    pub download_total: u64,
    pub memory_inuse: u64,
}

/// Subscribe to real-time traffic data. Emits "traffic-update" events every ~1 second.
#[tauri::command]
pub async fn subscribe_traffic(app: AppHandle) -> Result<(), String> {
    let process = app.state::<Arc<SingboxProcess>>().inner().clone();

    let response = process.api().traffic_stream().await?;

    tokio::spawn(async move {
        let mut response = response;
        let mut buffer = String::new();

        loop {
            match response.chunk().await {
                Ok(Some(chunk)) => {
                    let text = String::from_utf8_lossy(&chunk);
                    buffer.push_str(&text);

                    while let Some(newline_pos) = buffer.find('\n') {
                        let line = buffer[..newline_pos].trim().to_string();
                        buffer = buffer[newline_pos + 1..].to_string();

                        if line.is_empty() {
                            continue;
                        }

                        if let Ok(val) = serde_json::from_str::<serde_json::Value>(&line) {
                            let up = val.get("up").and_then(|v| v.as_u64()).unwrap_or(0);
                            let down = val.get("down").and_then(|v| v.as_u64()).unwrap_or(0);
                            let _ = app.emit("traffic-update", TrafficEvent { up, down });
                        }
                    }
                }
                Ok(None) => break,
                Err(_) => break,
            }
        }
    });

    Ok(())
}

/// Get a snapshot of dashboard-relevant info in one call.
#[tauri::command]
pub async fn get_dashboard_info(app: AppHandle) -> Result<DashboardInfo, String> {
    let process = app.state::<Arc<SingboxProcess>>().inner().clone();
    let running = process.is_running().await;

    if !running {
        return Ok(DashboardInfo {
            running: false,
            version: "not running".to_string(),
            active_connections: 0,
            upload_total: 0,
            download_total: 0,
            memory_inuse: 0,
        });
    }

    let version = process
        .api()
        .version()
        .await
        .map(|v| v.version)
        .unwrap_or_else(|_| "unknown".to_string());

    let (active_connections, upload_total, download_total, memory_inuse) =
        match process.api().get_connections().await {
            Ok(val) => {
                let conns = val
                    .get("connections")
                    .and_then(|c| c.as_array())
                    .map(|a| a.len())
                    .unwrap_or(0);
                let up = val.get("uploadTotal").and_then(|v| v.as_u64()).unwrap_or(0);
                let down = val
                    .get("downloadTotal")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0);
                let mem = val.get("memory").and_then(|v| v.as_u64()).unwrap_or(0);
                (conns, up, down, mem)
            }
            Err(_) => (0, 0, 0, 0),
        };

    Ok(DashboardInfo {
        running,
        version,
        active_connections,
        upload_total,
        download_total,
        memory_inuse,
    })
}
