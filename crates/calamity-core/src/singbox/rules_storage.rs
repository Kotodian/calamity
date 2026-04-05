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
    pub outbound: String, // "proxy" | "direct" | "reject"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub outbound_node: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rule_set_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rule_set_local_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub download_detour: Option<String>,
    #[serde(default)]
    pub invert: bool,
    pub order: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RulesData {
    pub rules: Vec<RouteRuleConfig>,
    #[serde(default = "default_final_outbound")]
    pub final_outbound: String,
    #[serde(default)]
    pub final_outbound_node: Option<String>,
    /// Auto-update interval in seconds (0 = disabled). Default: 86400 (24h)
    #[serde(default = "default_update_interval")]
    pub update_interval: u64,
}

fn default_final_outbound() -> String {
    "proxy".to_string()
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

#[cfg(test)]
mod tests {
    use super::RulesData;

    #[test]
    fn old_rules_json_defaults_final_outbound_fields() {
        let json = r#"{
            "rules": [],
            "updateInterval": 3600
        }"#;

        let data: RulesData = serde_json::from_str(json).expect("old rules data should deserialize");

        assert_eq!(data.final_outbound, "proxy");
        assert_eq!(data.final_outbound_node, None);
        assert_eq!(data.update_interval, 3600);
    }
}
