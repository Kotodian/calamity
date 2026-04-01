use crate::singbox::ruleset_market::{self, RuleSetEntry};

#[tauri::command]
pub async fn get_ruleset_list() -> Result<Vec<RuleSetEntry>, String> {
    ruleset_market::get_ruleset_list().await
}
