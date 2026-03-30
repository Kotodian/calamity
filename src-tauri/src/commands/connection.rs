use serde::Serialize;
use std::sync::Arc;
use tauri::{AppHandle, Manager};

use crate::singbox::process::SingboxProcess;
use crate::singbox::storage;

#[derive(Clone, Serialize)]
pub struct SingboxStatus {
    pub running: bool,
    pub version: String,
}

async fn cleanup_before_app_exit<F, Fut>(stop: F) -> Result<(), String>
where
    F: FnOnce() -> Fut,
    Fut: std::future::Future<Output = Result<(), String>>,
{
    crate::commands::settings::clear_system_proxy_on_exit();
    stop().await
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
        process
            .api()
            .version()
            .await
            .map(|v| v.version)
            .unwrap_or_else(|_| "unknown".to_string())
    } else {
        "not running".to_string()
    };
    Ok(SingboxStatus { running, version })
}

#[tauri::command]
pub async fn app_quit(app: AppHandle) {
    // Clean up before exiting — the RunEvent::Exit handler is only a fallback.
    let process = app.state::<Arc<SingboxProcess>>().inner().clone();
    if let Err(error) = cleanup_before_app_exit(|| async move { process.stop().await }).await {
        eprintln!("[singbox] failed to stop during app quit: {}", error);
    }
    app.exit(0);
}

#[cfg(test)]
mod tests {
    use super::cleanup_before_app_exit;
    use std::sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    };

    #[test]
    fn app_quit_cleanup_awaits_async_stop() {
        let called = Arc::new(AtomicBool::new(false));
        let called_for_stop = called.clone();

        let result = tauri::async_runtime::block_on(cleanup_before_app_exit(|| async move {
            called_for_stop.store(true, Ordering::SeqCst);
            Ok(())
        }));

        assert!(result.is_ok());
        assert!(called.load(Ordering::SeqCst));
    }
}
