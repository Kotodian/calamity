use serde::Serialize;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};

use crate::singbox::process::SingboxProcess;
use crate::singbox::nodes_storage;
use crate::singbox::storage;

#[derive(Clone, Serialize)]
pub struct SingboxStatus {
    pub running: bool,
    pub version: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionSnapshot {
    pub status: String,
    pub mode: String,
    pub active_node: Option<String>,
    /// Present when sing-box crashed unexpectedly — contains stderr/log diagnostics.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub crash_reason: Option<String>,
}

async fn cleanup_before_app_exit<F, Fut>(stop: F) -> Result<(), String>
where
    F: FnOnce() -> Fut,
    Fut: std::future::Future<Output = Result<(), String>>,
{
    crate::commands::settings::clear_system_proxy_on_exit();
    stop().await
}

fn build_connection_snapshot(
    running: bool,
    proxy_mode: &str,
    active_node: Option<String>,
    crash_reason: Option<String>,
) -> ConnectionSnapshot {
    ConnectionSnapshot {
        status: if running {
            "connected".to_string()
        } else {
            "disconnected".to_string()
        },
        mode: proxy_mode.to_string(),
        active_node,
        crash_reason,
    }
}

pub(crate) fn should_emit_connection_state_changed(
    previous_running: Option<bool>,
    current_running: bool,
) -> bool {
    previous_running.is_some() && previous_running != Some(current_running)
}

pub async fn emit_connection_state_changed(app: &AppHandle) {
    let process = app.state::<Arc<SingboxProcess>>().inner().clone();
    let settings = storage::load_settings();
    let nodes = nodes_storage::load_nodes();
    let running = process.is_running().await;

    // Collect crash reason when transitioning to disconnected
    let crash_reason = if !running {
        process.collect_crash_reason().await
    } else {
        None
    };

    let snapshot = build_connection_snapshot(running, &settings.proxy_mode, nodes.active_node, crash_reason);
    let _ = app.emit("connection-state-changed", snapshot);
}

#[tauri::command]
pub async fn singbox_start(app: AppHandle) -> Result<(), String> {
    let process = app.state::<Arc<SingboxProcess>>().inner().clone();
    let mut settings = storage::load_settings();
    process.start(&settings).await?;

    // Restore gateway mode rules (IP forwarding + pf) after sing-box starts
    if settings.gateway_mode {
        crate::commands::settings::apply_gateway_rules(&settings);
    }

    // Auto-enable system proxy if TUN is not enabled
    if !settings.enhanced_mode && !settings.system_proxy {
        settings.system_proxy = true;
        storage::save_settings(&settings)?;
        crate::commands::settings::set_system_proxy_ports(settings.http_port, settings.socks_port);
        let _ = app.emit("settings-changed", ());
    }

    // Auto-start BGP speaker if enabled
    let bgp_settings = crate::singbox::bgp::storage::load_bgp_settings();
    if bgp_settings.enabled {
        match crate::singbox::bgp::speaker::BgpSpeaker::start(None).await {
            Ok(speaker) => {
                app.manage(std::sync::Arc::new(tokio::sync::Mutex::new(Some(speaker))));
                eprintln!("[bgp] speaker started on 0.0.0.0:17900");
            }
            Err(e) => eprintln!("[bgp] failed to start speaker: {e}"),
        }
    }

    emit_connection_state_changed(&app).await;
    Ok(())
}

#[tauri::command]
pub async fn singbox_stop(app: AppHandle) -> Result<(), String> {
    let process = app.state::<Arc<SingboxProcess>>().inner().clone();
    process.stop().await?;

    // Clear system proxy without persisting — reconnect will restore it
    crate::commands::settings::clear_system_proxy_on_exit();

    emit_connection_state_changed(&app).await;
    Ok(())
}

#[tauri::command]
pub async fn singbox_restart(app: AppHandle) -> Result<(), String> {
    let process = app.state::<Arc<SingboxProcess>>().inner().clone();
    let settings = storage::load_settings();
    process.restart(&settings).await?;
    emit_connection_state_changed(&app).await;
    Ok(())
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
    emit_connection_state_changed(&app).await;
    app.exit(0);
}

#[cfg(test)]
mod tests {
    use super::{
        build_connection_snapshot, cleanup_before_app_exit, should_emit_connection_state_changed,
    };
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

    #[test]
    fn running_snapshot_is_connected_without_active_node() {
        let snapshot = build_connection_snapshot(true, "rule", None, None);

        assert_eq!(snapshot.status, "connected");
        assert_eq!(snapshot.mode, "rule");
        assert_eq!(snapshot.active_node, None);
    }

    #[test]
    fn watchdog_emits_only_when_running_state_changes_after_initial_sample() {
        assert!(!should_emit_connection_state_changed(None, false));
        assert!(!should_emit_connection_state_changed(Some(true), true));
        assert!(should_emit_connection_state_changed(Some(true), false));
        assert!(should_emit_connection_state_changed(Some(false), true));
    }
}
