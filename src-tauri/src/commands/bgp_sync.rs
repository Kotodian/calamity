use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};

use crate::singbox::bgp::{fsm, speaker, storage};
use crate::singbox::rules_storage::{self, RouteRuleConfig, RulesData};
use crate::singbox::tailscale_api;
use crate::singbox::tailscale_storage;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuleDiff {
    pub added: Vec<RouteRuleConfig>,
    pub removed: Vec<RouteRuleConfig>,
    pub modified: Vec<RuleDiffEntry>,
    pub final_outbound_changed: bool,
    pub new_final_outbound: String,
    pub new_final_outbound_node: Option<String>,
    /// The full remote RulesData for applying
    pub remote_rules: RulesData,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuleDiffEntry {
    pub local: RouteRuleConfig,
    pub remote: RouteRuleConfig,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredPeer {
    pub name: String,
    pub hostname: String,
    pub address: String,
}

fn compute_diff(local: &RulesData, remote: &RulesData) -> RuleDiff {
    let local_map: std::collections::HashMap<&str, &RouteRuleConfig> =
        local.rules.iter().map(|r| (r.id.as_str(), r)).collect();
    let remote_map: std::collections::HashMap<&str, &RouteRuleConfig> =
        remote.rules.iter().map(|r| (r.id.as_str(), r)).collect();

    let mut added = Vec::new();
    let mut removed = Vec::new();
    let mut modified = Vec::new();

    for rule in &remote.rules {
        if !local_map.contains_key(rule.id.as_str()) {
            added.push(rule.clone());
        }
    }

    for rule in &local.rules {
        if !remote_map.contains_key(rule.id.as_str()) {
            removed.push(rule.clone());
        }
    }

    for rule in &remote.rules {
        if let Some(local_rule) = local_map.get(rule.id.as_str()) {
            let local_json = serde_json::to_string(local_rule).unwrap_or_default();
            let remote_json = serde_json::to_string(rule).unwrap_or_default();
            if local_json != remote_json {
                modified.push(RuleDiffEntry {
                    local: (*local_rule).clone(),
                    remote: rule.clone(),
                });
            }
        }
    }

    let final_outbound_changed = local.final_outbound != remote.final_outbound
        || local.final_outbound_node != remote.final_outbound_node;

    RuleDiff {
        added,
        removed,
        modified,
        final_outbound_changed,
        new_final_outbound: remote.final_outbound.clone(),
        new_final_outbound_node: remote.final_outbound_node.clone(),
        remote_rules: remote.clone(),
    }
}

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
        if let Some(ip) = speaker::get_tailscale_ip() {
            let bgp_speaker = speaker::BgpSpeaker::start(ip, None).await?;
            app.manage(Arc::new(tokio::sync::Mutex::new(Some(bgp_speaker))));
        } else {
            return Err("Tailscale IP not found. Is Tailscale connected?".to_string());
        }
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
pub async fn bgp_pull_rules(peer_id: String) -> Result<RuleDiff, String> {
    let settings = storage::load_bgp_settings();
    let peer = settings
        .peers
        .iter()
        .find(|p| p.id == peer_id)
        .ok_or_else(|| format!("peer {peer_id} not found"))?;

    let local_ip = speaker::get_tailscale_ip().ok_or("Tailscale IP not found")?;
    let result = fsm::pull_rules(&peer.address, local_ip.octets()).await?;

    let local_rules = rules_storage::load_rules();
    let diff = compute_diff(&local_rules, &result.remote_rules);

    Ok(diff)
}

#[tauri::command]
pub async fn bgp_apply_rules(app: AppHandle, remote_rules: RulesData) -> Result<(), String> {
    rules_storage::save_rules(&remote_rules)?;

    let process = app
        .state::<Arc<crate::singbox::process::SingboxProcess>>()
        .inner()
        .clone();
    let settings = crate::singbox::storage::load_settings();
    match process
        .reload_with_timeout(&settings, std::time::Duration::from_secs(30))
        .await
    {
        Ok(()) => {
            let _ = app.emit("singbox-restarted", ());
        }
        Err(e) => {
            let _ = app.emit("singbox-error", &e);
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn bgp_discover_peers() -> Result<Vec<DiscoveredPeer>, String> {
    let mut ts_settings = tailscale_storage::load_tailscale_settings();
    let devices = tailscale_api::fetch_devices(&mut ts_settings).await?;
    let peers: Vec<DiscoveredPeer> = devices
        .into_iter()
        .filter(|d| !d.is_self && d.hostname.to_lowercase().contains("calamity"))
        .map(|d| DiscoveredPeer {
            name: d.name.clone(),
            hostname: d.hostname,
            address: d.ip,
        })
        .collect();
    Ok(peers)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rule(id: &str, name: &str, outbound: &str) -> RouteRuleConfig {
        RouteRuleConfig {
            id: id.to_string(),
            name: name.to_string(),
            enabled: true,
            match_type: "domain-suffix".to_string(),
            match_value: "example.com".to_string(),
            outbound: outbound.to_string(),
            outbound_node: None,
            rule_set_url: None,
            rule_set_local_path: None,
            download_detour: None,
            invert: false,
            order: 0,
        }
    }

    #[test]
    fn diff_detects_added_rules() {
        let local = RulesData {
            rules: vec![rule("1", "A", "proxy")],
            ..Default::default()
        };
        let remote = RulesData {
            rules: vec![rule("1", "A", "proxy"), rule("2", "B", "direct")],
            ..Default::default()
        };
        let diff = compute_diff(&local, &remote);
        assert_eq!(diff.added.len(), 1);
        assert_eq!(diff.added[0].id, "2");
        assert!(diff.removed.is_empty());
        assert!(diff.modified.is_empty());
    }

    #[test]
    fn diff_detects_removed_rules() {
        let local = RulesData {
            rules: vec![rule("1", "A", "proxy"), rule("2", "B", "direct")],
            ..Default::default()
        };
        let remote = RulesData {
            rules: vec![rule("1", "A", "proxy")],
            ..Default::default()
        };
        let diff = compute_diff(&local, &remote);
        assert!(diff.added.is_empty());
        assert_eq!(diff.removed.len(), 1);
        assert_eq!(diff.removed[0].id, "2");
    }

    #[test]
    fn diff_detects_modified_rules() {
        let local = RulesData {
            rules: vec![rule("1", "A", "proxy")],
            ..Default::default()
        };
        let remote = RulesData {
            rules: vec![rule("1", "A", "direct")],
            ..Default::default()
        };
        let diff = compute_diff(&local, &remote);
        assert!(diff.added.is_empty());
        assert!(diff.removed.is_empty());
        assert_eq!(diff.modified.len(), 1);
        assert_eq!(diff.modified[0].remote.outbound, "direct");
    }

    #[test]
    fn diff_detects_final_outbound_change() {
        let local = RulesData {
            final_outbound: "proxy".to_string(),
            ..Default::default()
        };
        let remote = RulesData {
            final_outbound: "direct".to_string(),
            ..Default::default()
        };
        let diff = compute_diff(&local, &remote);
        assert!(diff.final_outbound_changed);
        assert_eq!(diff.new_final_outbound, "direct");
    }

    #[test]
    fn diff_no_changes() {
        let data = RulesData {
            rules: vec![rule("1", "A", "proxy")],
            ..Default::default()
        };
        let diff = compute_diff(&data, &data);
        assert!(diff.added.is_empty());
        assert!(diff.removed.is_empty());
        assert!(diff.modified.is_empty());
        assert!(!diff.final_outbound_changed);
    }
}
