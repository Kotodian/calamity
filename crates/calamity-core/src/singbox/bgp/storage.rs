use serde::{Deserialize, Serialize};

use crate::singbox::storage::{read_json, write_json};

const BGP_FILE: &str = "bgp.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BgpPeer {
    pub id: String,
    pub name: String,
    pub address: String,
    #[serde(default)]
    pub auto_discovered: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct BgpSettings {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub peers: Vec<BgpPeer>,
    #[serde(default)]
    pub active_peer: Option<String>,
}

pub fn load_bgp_settings() -> BgpSettings {
    read_json(BGP_FILE)
}

pub fn save_bgp_settings(settings: &BgpSettings) -> Result<(), String> {
    write_json(BGP_FILE, settings)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_settings() {
        let settings = BgpSettings::default();
        assert!(!settings.enabled);
        assert!(settings.peers.is_empty());
    }

    #[test]
    fn deserialize_partial_json() {
        let json = r#"{"enabled": true}"#;
        let settings: BgpSettings = serde_json::from_str(json).unwrap();
        assert!(settings.enabled);
        assert!(settings.peers.is_empty());
    }

    #[test]
    fn roundtrip_serialization() {
        let settings = BgpSettings {
            enabled: true,
            peers: vec![BgpPeer {
                id: "peer-1".to_string(),
                name: "Mac Mini".to_string(),
                address: "100.64.0.2".to_string(),
                auto_discovered: true,
            }],
            active_peer: None,
        };
        let json = serde_json::to_string(&settings).unwrap();
        let deserialized: BgpSettings = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.peers.len(), 1);
        assert_eq!(deserialized.peers[0].name, "Mac Mini");
        assert!(deserialized.peers[0].auto_discovered);
    }

    #[test]
    fn camel_case_keys() {
        let settings = BgpSettings {
            enabled: true,
            peers: vec![BgpPeer {
                id: "p1".to_string(),
                name: "test".to_string(),
                address: "10.0.0.1".to_string(),
                auto_discovered: false,
            }],
            active_peer: None,
        };
        let json = serde_json::to_string(&settings).unwrap();
        assert!(json.contains("autoDiscovered"));
        assert!(!json.contains("auto_discovered"));
    }

    #[test]
    fn active_peer_serialization() {
        let settings = BgpSettings {
            enabled: true,
            peers: vec![],
            active_peer: Some("peer-1".to_string()),
        };
        let json = serde_json::to_string(&settings).unwrap();
        assert!(json.contains("activePeer"));
        let deserialized: BgpSettings = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.active_peer, Some("peer-1".to_string()));
    }

    #[test]
    fn active_peer_defaults_to_none() {
        let json = r#"{"enabled": true, "peers": []}"#;
        let settings: BgpSettings = serde_json::from_str(json).unwrap();
        assert_eq!(settings.active_peer, None);
    }
}
