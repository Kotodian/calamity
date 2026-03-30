use std::collections::HashSet;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};

use crate::singbox::nodes_storage::{self, NodeGroup, NodesData, ProxyNode};
use crate::singbox::process::SingboxProcess;
use crate::singbox::storage;
use crate::singbox::subscription_fetch;
use crate::singbox::subscriptions_storage::{self, SubscriptionConfig, SubscriptionsData};

/// Deduplicate node names against existing nodes in other groups.
/// If a name conflicts, append " (2)", " (3)", etc.
fn deduplicate_nodes(
    nodes: Vec<ProxyNode>,
    existing: &NodesData,
    exclude_group_id: &str,
) -> Vec<ProxyNode> {
    let existing_names: HashSet<String> = existing
        .groups
        .iter()
        .filter(|g| g.id != exclude_group_id)
        .flat_map(|g| g.nodes.iter().map(|n| n.name.clone()))
        .collect();

    let mut used_names: HashSet<String> = existing_names;
    nodes
        .into_iter()
        .map(|mut node| {
            let original = node.name.clone();
            let mut counter = 2;
            while used_names.contains(&node.name) {
                node.name = format!("{} ({})", original, counter);
                node.id = node.name.clone();
                counter += 1;
            }
            used_names.insert(node.name.clone());
            node
        })
        .collect()
}

#[tauri::command]
pub async fn get_subscriptions() -> Result<SubscriptionsData, String> {
    Ok(subscriptions_storage::load_subscriptions())
}

#[tauri::command]
pub async fn add_subscription(
    app: AppHandle,
    name: String,
    url: String,
    auto_update_interval: Option<u64>,
) -> Result<SubscriptionConfig, String> {
    let mut subs_data = subscriptions_storage::load_subscriptions();
    let mut nodes_data = nodes_storage::load_nodes();

    let group_id = format!(
        "sub-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis()
    );

    let sub_id = format!("sub-{}", uuid::Uuid::new_v4());

    // Fetch subscription
    let result = subscription_fetch::fetch_subscription(&url).await?;

    let deduped_nodes = deduplicate_nodes(result.nodes, &nodes_data, &group_id);
    let node_count = deduped_nodes.len() as u32;
    nodes_data.groups.push(NodeGroup {
        id: group_id.clone(),
        name: name.clone(),
        group_type: "select".to_string(),
        nodes: deduped_nodes,
    });
    nodes_storage::save_nodes(&nodes_data)?;

    let sub = SubscriptionConfig {
        id: sub_id,
        name,
        url,
        enabled: true,
        auto_update_interval: auto_update_interval.unwrap_or(43200),
        last_updated: Some(chrono::Utc::now().to_rfc3339()),
        node_count,
        group_id,
        traffic_upload: result.user_info.as_ref().map(|u| u.upload).unwrap_or(0),
        traffic_download: result.user_info.as_ref().map(|u| u.download).unwrap_or(0),
        traffic_total: result.user_info.as_ref().map(|u| u.total).unwrap_or(0),
        expire: result.user_info.as_ref().and_then(|u| u.expire.clone()),
    };

    subs_data.subscriptions.push(sub.clone());
    subscriptions_storage::save_subscriptions(&subs_data)?;

    restart_singbox(&app).await;
    Ok(sub)
}

#[tauri::command]
pub async fn update_subscription(app: AppHandle, id: String) -> Result<SubscriptionConfig, String> {
    let mut subs_data = subscriptions_storage::load_subscriptions();
    let mut nodes_data = nodes_storage::load_nodes();

    let sub = subs_data
        .subscriptions
        .iter_mut()
        .find(|s| s.id == id)
        .ok_or_else(|| format!("subscription {} not found", id))?;

    let result = subscription_fetch::fetch_subscription(&sub.url).await?;

    // Full replacement of nodes in the group
    let group_id = sub.group_id.clone();
    let deduped_nodes = deduplicate_nodes(result.nodes, &nodes_data, &group_id);
    if let Some(group) = nodes_data.groups.iter_mut().find(|g| g.id == group_id) {
        group.nodes = deduped_nodes;
        group.name = sub.name.clone();
    }
    nodes_storage::save_nodes(&nodes_data)?;

    sub.last_updated = Some(chrono::Utc::now().to_rfc3339());
    sub.node_count = nodes_data
        .groups
        .iter()
        .find(|g| g.id == sub.group_id)
        .map(|g| g.nodes.len() as u32)
        .unwrap_or(0);
    if let Some(info) = &result.user_info {
        sub.traffic_upload = info.upload;
        sub.traffic_download = info.download;
        sub.traffic_total = info.total;
        sub.expire = info.expire.clone();
    }

    let updated = sub.clone();
    subscriptions_storage::save_subscriptions(&subs_data)?;

    restart_singbox(&app).await;
    Ok(updated)
}

#[tauri::command]
pub async fn update_all_subscriptions(app: AppHandle) -> Result<Vec<SubscriptionConfig>, String> {
    let subs_data = subscriptions_storage::load_subscriptions();
    let enabled_ids: Vec<String> = subs_data
        .subscriptions
        .iter()
        .filter(|s| s.enabled)
        .map(|s| s.id.clone())
        .collect();

    let mut results = Vec::new();
    for id in enabled_ids {
        match update_subscription(app.clone(), id).await {
            Ok(sub) => results.push(sub),
            Err(e) => eprintln!("[subscriptions] update failed: {}", e),
        }
    }
    Ok(results)
}

#[tauri::command]
pub async fn delete_subscription(app: AppHandle, id: String) -> Result<(), String> {
    let mut subs_data = subscriptions_storage::load_subscriptions();
    let mut nodes_data = nodes_storage::load_nodes();

    let sub = subs_data
        .subscriptions
        .iter()
        .find(|s| s.id == id)
        .ok_or_else(|| format!("subscription {} not found", id))?;
    let group_id = sub.group_id.clone();

    // Remove the node group
    nodes_data.groups.retain(|g| g.id != group_id);
    if let Some(active) = &nodes_data.active_node {
        let still_exists = nodes_data
            .groups
            .iter()
            .any(|g| g.nodes.iter().any(|n| &n.name == active));
        if !still_exists {
            nodes_data.active_node = None;
        }
    }
    nodes_storage::save_nodes(&nodes_data)?;

    subs_data.subscriptions.retain(|s| s.id != id);
    subscriptions_storage::save_subscriptions(&subs_data)?;

    restart_singbox(&app).await;
    Ok(())
}

#[tauri::command]
pub async fn edit_subscription(
    id: String,
    name: Option<String>,
    url: Option<String>,
    auto_update_interval: Option<u64>,
) -> Result<SubscriptionConfig, String> {
    let mut subs_data = subscriptions_storage::load_subscriptions();

    let sub = subs_data
        .subscriptions
        .iter_mut()
        .find(|s| s.id == id)
        .ok_or_else(|| format!("subscription {} not found", id))?;

    if let Some(name) = name {
        let mut nodes_data = nodes_storage::load_nodes();
        if let Some(group) = nodes_data.groups.iter_mut().find(|g| g.id == sub.group_id) {
            group.name = name.clone();
        }
        nodes_storage::save_nodes(&nodes_data)?;
        sub.name = name;
    }
    if let Some(url) = url {
        sub.url = url;
    }
    if let Some(interval) = auto_update_interval {
        sub.auto_update_interval = interval;
    }

    let updated = sub.clone();
    subscriptions_storage::save_subscriptions(&subs_data)?;
    Ok(updated)
}

#[tauri::command]
pub async fn toggle_subscription(id: String, enabled: bool) -> Result<SubscriptionConfig, String> {
    let mut subs_data = subscriptions_storage::load_subscriptions();
    let sub = subs_data
        .subscriptions
        .iter_mut()
        .find(|s| s.id == id)
        .ok_or_else(|| format!("subscription {} not found", id))?;
    sub.enabled = enabled;
    let updated = sub.clone();
    subscriptions_storage::save_subscriptions(&subs_data)?;
    Ok(updated)
}

async fn restart_singbox(app: &AppHandle) {
    let process = app.state::<Arc<SingboxProcess>>().inner().clone();
    let settings = storage::load_settings();
    match process.reload(&settings).await {
        Ok(()) => {
            eprintln!("[subscriptions] sing-box reloaded successfully");
            let _ = app.emit("singbox-restarted", ());
        }
        Err(e) => {
            eprintln!("[subscriptions] sing-box reload failed: {}", e);
            let _ = app.emit("singbox-error", &e);
        }
    }
    crate::commands::connection::emit_connection_state_changed(app).await;
}
