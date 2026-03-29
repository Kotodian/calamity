use serde::{Deserialize, Serialize};

use super::storage::{read_json, write_json};

const RULES_FILE: &str = "rules.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RouteRuleConfig {
    pub id: String,
    pub name: String,
    pub enabled: bool,
    pub match_type: String,
    pub match_value: String,
    pub outbound: String,          // "proxy" | "direct" | "reject"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub outbound_node: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rule_set_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rule_set_local_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub download_detour: Option<String>,
    pub order: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RulesData {
    pub rules: Vec<RouteRuleConfig>,
    /// Auto-update interval in seconds (0 = disabled). Default: 86400 (24h)
    #[serde(default = "default_update_interval")]
    pub update_interval: u64,
}

fn default_update_interval() -> u64 {
    86400
}

pub fn load_rules() -> RulesData {
    read_json(RULES_FILE)
}

pub fn save_rules(data: &RulesData) -> Result<(), String> {
    write_json(RULES_FILE, data)
}
