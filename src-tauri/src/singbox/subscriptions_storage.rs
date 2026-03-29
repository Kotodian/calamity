use serde::{Deserialize, Serialize};
use super::storage::{read_json, write_json};

const SUBSCRIPTIONS_FILE: &str = "subscriptions.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubscriptionConfig {
    pub id: String,
    pub name: String,
    pub url: String,
    pub enabled: bool,
    pub auto_update_interval: u64, // seconds, 0 = never
    pub last_updated: Option<String>,
    pub node_count: u32,
    pub group_id: String,
    // From subscription-userinfo header
    pub traffic_upload: u64,
    pub traffic_download: u64,
    pub traffic_total: u64,
    pub expire: Option<String>, // ISO date string
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SubscriptionsData {
    pub subscriptions: Vec<SubscriptionConfig>,
}

pub fn load_subscriptions() -> SubscriptionsData {
    read_json(SUBSCRIPTIONS_FILE)
}

pub fn save_subscriptions(data: &SubscriptionsData) -> Result<(), String> {
    write_json(SUBSCRIPTIONS_FILE, data)
}
