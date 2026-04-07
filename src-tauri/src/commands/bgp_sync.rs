use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};

use crate::singbox::bgp::{discovery, speaker, storage, sync_session};

/// Type alias for the managed sync session state.
pub type SyncSessionState = Arc<tokio::sync::Mutex<Option<sync_session::SyncSession>>>;

#[tauri::command]
pub async fn bgp_get_settings() -> Result<storage::BgpSettings, String> {
    Ok(storage::load_bgp_settings())
}

#[tauri::command]
pub async fn bgp_set_enabled(app: AppHandle, enabled: bool) -> Result<(), String> {
    let mut settings = storage::load_bgp_settings();
    settings.enabled = enabled;
    storage::save_bgp_settings(&settings)?;

    if enabled {
        let bgp_speaker = speaker::BgpSpeaker::start(None).await?;
        app.manage(Arc::new(tokio::sync::Mutex::new(Some(bgp_speaker))));
    } else {
        if let Some(speaker_state) = app.try_state::<Arc<tokio::sync::Mutex<Option<speaker::BgpSpeaker>>>>() {
            let mut guard = speaker_state.lock().await;
            if let Some(s) = guard.take() {
                s.stop();
            }
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn bgp_add_peer(name: String, address: String) -> Result<storage::BgpSettings, String> {
    let mut settings = storage::load_bgp_settings();
    let peer = storage::BgpPeer {
        id: uuid::Uuid::new_v4().to_string(),
        name,
        address,
        auto_discovered: false,
    };
    settings.peers.push(peer);
    storage::save_bgp_settings(&settings)?;
    Ok(settings)
}

#[tauri::command]
pub async fn bgp_remove_peer(id: String) -> Result<storage::BgpSettings, String> {
    let mut settings = storage::load_bgp_settings();
    settings.peers.retain(|p| p.id != id);
    storage::save_bgp_settings(&settings)?;
    Ok(settings)
}

#[tauri::command]
pub async fn bgp_discover_peers() -> Result<Vec<discovery::DiscoveredPeer>, String> {
    Ok(discovery::discover_all().await)
}

#[tauri::command]
pub async fn bgp_start_sync(app: AppHandle, peer_id: String) -> Result<(), String> {
    let settings = storage::load_bgp_settings();
    let peer = settings
        .peers
        .iter()
        .find(|p| p.id == peer_id)
        .ok_or_else(|| format!("peer {peer_id} not found"))?
        .clone();

    let router_id = speaker::get_router_id();

    let app_handle = app.clone();
    let on_applied: sync_session::OnSyncApplied = Arc::new(move || {
        let app = app_handle.clone();
        tokio::spawn(async move {
            let process = app
                .state::<Arc<crate::singbox::process::SingboxProcess>>()
                .inner()
                .clone();
            let settings = crate::singbox::storage::load_settings();
            let _ = process.reload(&settings).await;
            let _ = app.emit("singbox-restarted", ());
        });
    });

    let session = sync_session::SyncSession::start(peer.address, router_id, on_applied).await?;

    let state = app.state::<SyncSessionState>();
    let mut guard = state.lock().await;
    // Stop any existing session
    if let Some(old) = guard.take() {
        old.stop();
    }
    *guard = Some(session);

    // Save active_peer
    let mut bgp_settings = storage::load_bgp_settings();
    bgp_settings.active_peer = Some(peer_id);
    storage::save_bgp_settings(&bgp_settings)?;

    Ok(())
}

#[tauri::command]
pub async fn bgp_stop_sync(app: AppHandle) -> Result<(), String> {
    let state = app.state::<SyncSessionState>();
    let mut guard = state.lock().await;
    if let Some(session) = guard.take() {
        session.stop();
    }

    // Clear active_peer
    let mut settings = storage::load_bgp_settings();
    settings.active_peer = None;
    storage::save_bgp_settings(&settings)?;

    Ok(())
}

#[tauri::command]
pub async fn bgp_sync_status(app: AppHandle) -> Result<sync_session::SyncStatus, String> {
    let state = app.state::<SyncSessionState>();
    let guard = state.lock().await;
    match guard.as_ref() {
        Some(session) => Ok(session.status().await),
        None => Ok(sync_session::SyncStatus::Disconnected),
    }
}
