use serde::{Deserialize, Serialize};

use super::storage::{read_json, write_json};

const TAILSCALE_FILE: &str = "tailscale.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TailscaleSettings {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub auth_key: String,
    #[serde(default)]
    pub oauth_client_id: String,
    #[serde(default)]
    pub oauth_client_secret: String,
    #[serde(default)]
    pub oauth_access_token: String,
    #[serde(default)]
    pub oauth_token_expires: String,
    #[serde(default)]
    pub tailnet: String,
    #[serde(default = "default_hostname")]
    pub hostname: String,
    #[serde(default)]
    pub exit_node: String,
    #[serde(default)]
    pub accept_routes: bool,
    #[serde(default)]
    pub advertise_routes: Vec<String>,
}

fn default_hostname() -> String {
    "calamity".to_string()
}

impl Default for TailscaleSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            auth_key: String::new(),
            oauth_client_id: String::new(),
            oauth_client_secret: String::new(),
            oauth_access_token: String::new(),
            oauth_token_expires: String::new(),
            tailnet: String::new(),
            hostname: default_hostname(),
            exit_node: String::new(),
            accept_routes: false,
            advertise_routes: Vec::new(),
        }
    }
}

pub fn load_tailscale_settings() -> TailscaleSettings {
    read_json(TAILSCALE_FILE)
}

pub fn save_tailscale_settings(settings: &TailscaleSettings) -> Result<(), String> {
    write_json(TAILSCALE_FILE, settings)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_settings_have_expected_values() {
        let settings = TailscaleSettings::default();
        assert!(!settings.enabled);
        assert_eq!(settings.hostname, "calamity");
        assert!(settings.auth_key.is_empty());
        assert!(settings.oauth_client_id.is_empty());
        assert!(settings.exit_node.is_empty());
        assert!(!settings.accept_routes);
        assert!(settings.advertise_routes.is_empty());
    }

    #[test]
    fn deserialize_partial_json_fills_defaults() {
        let json = r#"{
            "enabled": true,
            "authKey": "tskey-auth-abc123",
            "exitNode": "my-server"
        }"#;

        let settings: TailscaleSettings =
            serde_json::from_str(json).expect("should deserialize partial JSON");

        assert!(settings.enabled);
        assert_eq!(settings.auth_key, "tskey-auth-abc123");
        assert_eq!(settings.exit_node, "my-server");
        assert_eq!(settings.hostname, "calamity");
        assert!(settings.oauth_client_id.is_empty());
        assert!(!settings.accept_routes);
    }

    #[test]
    fn roundtrip_serialization() {
        let settings = TailscaleSettings {
            enabled: true,
            auth_key: "tskey-auth-test".to_string(),
            oauth_client_id: "client-id".to_string(),
            oauth_client_secret: "client-secret".to_string(),
            oauth_access_token: String::new(),
            oauth_token_expires: String::new(),
            tailnet: "example.ts.net".to_string(),
            hostname: "my-node".to_string(),
            exit_node: "exit-server".to_string(),
            accept_routes: true,
            advertise_routes: vec!["192.168.1.0/24".to_string()],
        };

        let json = serde_json::to_string(&settings).expect("should serialize");
        let deserialized: TailscaleSettings =
            serde_json::from_str(&json).expect("should deserialize");

        assert_eq!(deserialized.enabled, settings.enabled);
        assert_eq!(deserialized.auth_key, settings.auth_key);
        assert_eq!(deserialized.oauth_client_id, settings.oauth_client_id);
        assert_eq!(deserialized.tailnet, settings.tailnet);
        assert_eq!(deserialized.hostname, settings.hostname);
        assert_eq!(deserialized.exit_node, settings.exit_node);
        assert_eq!(deserialized.accept_routes, settings.accept_routes);
        assert_eq!(deserialized.advertise_routes, settings.advertise_routes);
    }

    #[test]
    fn camel_case_serialization() {
        let settings = TailscaleSettings {
            oauth_client_id: "test-id".to_string(),
            ..Default::default()
        };

        let json = serde_json::to_string(&settings).expect("should serialize");
        assert!(json.contains("oauthClientId"));
        assert!(json.contains("authKey"));
        assert!(json.contains("exitNode"));
        assert!(json.contains("acceptRoutes"));
        assert!(!json.contains("oauth_client_id"));
    }
}
