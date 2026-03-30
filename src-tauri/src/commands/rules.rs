use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};

use crate::singbox::process::SingboxProcess;
use crate::singbox::rules_storage::{self, RouteRuleConfig, RulesData};
use crate::singbox::storage;

#[tauri::command]
pub async fn get_rules() -> Result<RulesData, String> {
    Ok(rules_storage::load_rules())
}

#[tauri::command]
pub async fn add_rule(app: AppHandle, rule: RouteRuleConfig) -> Result<RulesData, String> {
    let mut data = rules_storage::load_rules();
    data.rules.push(rule);
    reindex(&mut data);
    rules_storage::save_rules(&data)?;
    reload_singbox(&app).await;
    Ok(data)
}

#[tauri::command]
pub async fn update_rule(app: AppHandle, rule: RouteRuleConfig) -> Result<RulesData, String> {
    let mut data = rules_storage::load_rules();
    if let Some(existing) = data.rules.iter_mut().find(|r| r.id == rule.id) {
        *existing = rule;
    }
    rules_storage::save_rules(&data)?;
    reload_singbox(&app).await;
    Ok(data)
}

#[tauri::command]
pub async fn delete_rule(app: AppHandle, id: String) -> Result<RulesData, String> {
    let mut data = rules_storage::load_rules();
    data.rules.retain(|r| r.id != id);
    reindex(&mut data);
    rules_storage::save_rules(&data)?;
    reload_singbox(&app).await;
    Ok(data)
}

#[tauri::command]
pub async fn reorder_rules(app: AppHandle, ordered_ids: Vec<String>) -> Result<RulesData, String> {
    let mut data = rules_storage::load_rules();
    data.rules.sort_by_key(|r| {
        ordered_ids
            .iter()
            .position(|id| id == &r.id)
            .unwrap_or(usize::MAX)
    });
    reindex(&mut data);
    rules_storage::save_rules(&data)?;
    reload_singbox(&app).await;
    Ok(data)
}

#[tauri::command]
pub async fn update_final_outbound(
    app: AppHandle,
    outbound: String,
    outbound_node: Option<String>,
) -> Result<RulesData, String> {
    let mut data = rules_storage::load_rules();
    data.final_outbound = outbound;
    data.final_outbound_node = outbound_node;
    rules_storage::save_rules(&data)?;
    reload_singbox(&app).await;
    Ok(data)
}

#[tauri::command]
pub async fn update_ruleset_interval(app: AppHandle, interval: u64) -> Result<RulesData, String> {
    let mut data = rules_storage::load_rules();
    data.update_interval = interval;
    rules_storage::save_rules(&data)?;
    reload_singbox(&app).await;
    Ok(data)
}

fn reindex(data: &mut RulesData) {
    for (i, rule) in data.rules.iter_mut().enumerate() {
        rule.order = i;
    }
}

async fn reload_singbox(app: &AppHandle) {
    let process = app.state::<Arc<SingboxProcess>>().inner().clone();
    let settings = storage::load_settings();
    match process.reload(&settings).await {
        Ok(()) => {
            eprintln!("[rules] sing-box reloaded successfully");
            let _ = app.emit("singbox-restarted", ());
        }
        Err(e) => {
            eprintln!("[rules] sing-box reload failed: {}", e);
            let _ = app.emit("singbox-error", &e);
        }
    }
    crate::commands::connection::emit_connection_state_changed(app).await;
}
