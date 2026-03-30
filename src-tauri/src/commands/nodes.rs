use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};

use crate::singbox::nodes_storage::{self, NodeGroup, NodesData, ProxyNode};
use crate::singbox::process::SingboxProcess;
use crate::singbox::storage;

#[tauri::command]
pub async fn get_nodes() -> Result<NodesData, String> {
    Ok(nodes_storage::load_nodes())
}

#[tauri::command]
pub async fn add_node(
    app: AppHandle,
    group_id: String,
    node: ProxyNode,
) -> Result<NodesData, String> {
    let mut data = nodes_storage::load_nodes();
    // Validate name uniqueness across all groups
    let name_exists = data
        .groups
        .iter()
        .any(|g| g.nodes.iter().any(|n| n.name == node.name));
    if name_exists {
        return Err(format!("node name '{}' already exists", node.name));
    }
    let group = data
        .groups
        .iter_mut()
        .find(|g| g.id == group_id)
        .ok_or_else(|| format!("group {} not found", group_id))?;
    group.nodes.push(node);
    nodes_storage::save_nodes(&data)?;
    restart_singbox(&app).await;
    Ok(data)
}

#[tauri::command]
pub async fn update_node(
    app: AppHandle,
    old_name: String,
    node: ProxyNode,
) -> Result<NodesData, String> {
    let mut data = nodes_storage::load_nodes();
    // If name changed, validate uniqueness
    if old_name != node.name {
        let name_exists = data
            .groups
            .iter()
            .any(|g| g.nodes.iter().any(|n| n.name == node.name));
        if name_exists {
            return Err(format!("node name '{}' already exists", node.name));
        }
    }
    let new_name = node.name.clone();
    for group in &mut data.groups {
        if let Some(existing) = group.nodes.iter_mut().find(|n| n.name == old_name) {
            *existing = node;
            break;
        }
    }
    // Update active_node if it pointed to the old name
    if data.active_node.as_deref() == Some(&old_name) {
        data.active_node = Some(new_name);
    }
    nodes_storage::save_nodes(&data)?;
    restart_singbox(&app).await;
    Ok(data)
}

#[tauri::command]
pub async fn remove_node(app: AppHandle, node_name: String) -> Result<NodesData, String> {
    let mut data = nodes_storage::load_nodes();
    for group in &mut data.groups {
        group.nodes.retain(|n| n.name != node_name);
    }
    if data.active_node.as_deref() == Some(&node_name) {
        data.active_node = None;
    }
    nodes_storage::save_nodes(&data)?;
    restart_singbox(&app).await;
    Ok(data)
}

#[tauri::command]
pub async fn add_group(
    app: AppHandle,
    name: String,
    group_type: Option<String>,
) -> Result<NodesData, String> {
    let mut data = nodes_storage::load_nodes();
    let id = format!(
        "group-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis()
    );
    data.groups.push(NodeGroup {
        id,
        name,
        group_type: group_type.unwrap_or_else(|| "select".to_string()),
        nodes: vec![],
    });
    nodes_storage::save_nodes(&data)?;
    restart_singbox(&app).await;
    Ok(data)
}

#[tauri::command]
pub async fn remove_group(app: AppHandle, group_id: String) -> Result<NodesData, String> {
    let mut data = nodes_storage::load_nodes();
    data.groups.retain(|g| g.id != group_id);
    nodes_storage::save_nodes(&data)?;
    restart_singbox(&app).await;
    Ok(data)
}

#[tauri::command]
pub async fn rename_group(group_id: String, name: String) -> Result<NodesData, String> {
    let mut data = nodes_storage::load_nodes();
    if let Some(g) = data.groups.iter_mut().find(|g| g.id == group_id) {
        g.name = name;
    }
    nodes_storage::save_nodes(&data)?;
    Ok(data)
}

#[tauri::command]
pub async fn disconnect_node(app: AppHandle) -> Result<NodesData, String> {
    let mut data = nodes_storage::load_nodes();
    data.active_node = None;
    nodes_storage::save_nodes(&data)?;
    restart_singbox(&app).await;
    Ok(data)
}

#[tauri::command]
pub async fn set_active_node(app: AppHandle, node_name: String) -> Result<NodesData, String> {
    let mut data = nodes_storage::load_nodes();
    data.active_node = Some(node_name);
    nodes_storage::save_nodes(&data)?;
    restart_singbox(&app).await;
    Ok(data)
}

#[tauri::command]
pub async fn test_node_latency(app: AppHandle, node_name: String) -> Result<u64, String> {
    let process = app.state::<Arc<SingboxProcess>>().inner().clone();
    process.api().test_delay(&node_name, 5000).await
}

#[tauri::command]
pub async fn test_group_latency(
    app: AppHandle,
    group_id: String,
) -> Result<Vec<(String, Option<u64>)>, String> {
    let data = nodes_storage::load_nodes();
    let group = data
        .groups
        .iter()
        .find(|g| g.id == group_id)
        .ok_or_else(|| format!("group {} not found", group_id))?;

    let process = app.state::<Arc<SingboxProcess>>().inner().clone();
    let mut results = Vec::new();

    for node in &group.nodes {
        let latency = process.api().test_delay(&node.name, 5000).await.ok();
        results.push((node.name.clone(), latency));
    }

    Ok(results)
}

async fn restart_singbox(app: &AppHandle) {
    let process = app.state::<Arc<SingboxProcess>>().inner().clone();
    let settings = storage::load_settings();
    match process.reload(&settings).await {
        Ok(()) => {
            eprintln!("[nodes] sing-box reloaded successfully");
            let _ = app.emit("singbox-restarted", ());
        }
        Err(e) => {
            eprintln!("[nodes] sing-box reload failed: {}", e);
            let _ = app.emit("singbox-error", &e);
        }
    }
    crate::commands::connection::emit_connection_state_changed(app).await;
}
