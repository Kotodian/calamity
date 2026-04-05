use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::storage::{read_json, write_json};

const NODES_FILE: &str = "nodes.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NodesData {
    pub groups: Vec<NodeGroup>,
    pub active_node: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeGroup {
    pub id: String,
    pub name: String,
    #[serde(default = "default_group_type")]
    pub group_type: String,
    pub nodes: Vec<ProxyNode>,
}

fn default_group_type() -> String {
    "select".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxyNode {
    pub id: String,
    pub name: String,
    pub server: String,
    pub port: u16,
    pub protocol: String,
    pub country: String,
    pub country_code: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub protocol_config: Option<Value>,
}

impl Default for NodesData {
    fn default() -> Self {
        Self {
            groups: vec![NodeGroup {
                id: "proxy".to_string(),
                name: "Proxy".to_string(),
                group_type: "select".to_string(),
                nodes: vec![],
            }],
            active_node: None,
        }
    }
}

pub fn load_nodes() -> NodesData {
    read_json(NODES_FILE)
}

pub fn save_nodes(data: &NodesData) -> Result<(), String> {
    write_json(NODES_FILE, data)
}
