use serde_json::json;

use super::storage;
use super::tailscale_storage;

const TAILSCALE_CONFIG_FILE: &str = "06-tailscale.json";

/// Get the absolute path for Tailscale state directory.
pub fn tailscale_state_dir() -> std::path::PathBuf {
    storage::app_data_dir().join("tailscale")
}

/// Find the active proxy node tag to use as detour for Tailscale control plane.
fn find_active_proxy_tag() -> Option<String> {
    let nodes_data = super::nodes_storage::load_nodes();
    // Use explicitly active node
    if let Some(active) = &nodes_data.active_node {
        for group in &nodes_data.groups {
            for node in &group.nodes {
                if &node.name == active {
                    return Some(node.name.clone());
                }
            }
        }
    }
    // Fallback to first available node
    for group in &nodes_data.groups {
        if let Some(node) = group.nodes.first() {
            return Some(node.name.clone());
        }
    }
    None
}

/// Build the sing-box Tailscale endpoint JSON config from settings.
/// Returns None if Tailscale is disabled.
pub fn build_tailscale_config(
    settings: &tailscale_storage::TailscaleSettings,
) -> Option<serde_json::Value> {
    if !settings.enabled {
        return None;
    }

    let state_dir = tailscale_state_dir();

    let mut endpoint = json!({
        "type": "tailscale",
        "tag": "tailscale-ep",
        "state_directory": state_dir.to_string_lossy(),
        "hostname": settings.hostname,
        "accept_routes": settings.accept_routes,
    });

    if !settings.auth_key.is_empty() {
        endpoint["auth_key"] = json!(settings.auth_key);
    }

    if !settings.exit_node.is_empty() {
        endpoint["exit_node"] = json!(settings.exit_node);
    }

    if !settings.advertise_routes.is_empty() {
        endpoint["advertise_routes"] = json!(settings.advertise_routes);
    }

    // Route Tailscale control plane traffic through an existing proxy node
    // (controlplane.tailscale.com is blocked in China without a proxy)
    if let Some(proxy_tag) = find_active_proxy_tag() {
        endpoint["detour"] = json!(proxy_tag);
    }

    Some(json!({
        "endpoints": [endpoint]
    }))
}

/// Generate and write 06-tailscale.json to the config directory.
/// If Tailscale is disabled, removes the file.
pub fn write_tailscale_config() -> Result<(), String> {
    let settings = tailscale_storage::load_tailscale_settings();
    let config_dir = storage::singbox_config_dir();
    let config_path = config_dir.join(TAILSCALE_CONFIG_FILE);

    match build_tailscale_config(&settings) {
        Some(config) => {
            std::fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;
            let content = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
            std::fs::write(&config_path, content).map_err(|e| e.to_string())
        }
        None => {
            let _ = std::fs::remove_file(&config_path);
            Ok(())
        }
    }
}

/// Remove the Tailscale config file.
pub fn remove_tailscale_config() {
    let config_dir = storage::singbox_config_dir();
    let config_path = config_dir.join(TAILSCALE_CONFIG_FILE);
    let _ = std::fs::remove_file(&config_path);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::singbox::tailscale_storage::TailscaleSettings;

    #[test]
    fn disabled_returns_none() {
        let settings = TailscaleSettings::default();
        assert!(build_tailscale_config(&settings).is_none());
    }

    #[test]
    fn enabled_minimal_config() {
        let settings = TailscaleSettings {
            enabled: true,
            hostname: "my-node".to_string(),
            ..Default::default()
        };

        let config = build_tailscale_config(&settings).expect("should produce config");
        let endpoints = config["endpoints"].as_array().expect("should have endpoints");
        assert_eq!(endpoints.len(), 1);

        let ep = &endpoints[0];
        assert_eq!(ep["type"], "tailscale");
        assert_eq!(ep["tag"], "tailscale-ep");
        assert_eq!(ep["hostname"], "my-node");
        assert_eq!(ep["accept_routes"], false);
        assert!(ep.get("auth_key").is_none());
        assert!(ep.get("exit_node").is_none());
        assert!(ep.get("advertise_routes").is_none());
    }

    #[test]
    fn auth_key_included_when_set() {
        let settings = TailscaleSettings {
            enabled: true,
            auth_key: "tskey-auth-abc123".to_string(),
            ..Default::default()
        };

        let config = build_tailscale_config(&settings).unwrap();
        let ep = &config["endpoints"][0];
        assert_eq!(ep["auth_key"], "tskey-auth-abc123");
    }

    #[test]
    fn exit_node_included_when_set() {
        let settings = TailscaleSettings {
            enabled: true,
            exit_node: "my-exit-server".to_string(),
            ..Default::default()
        };

        let config = build_tailscale_config(&settings).unwrap();
        let ep = &config["endpoints"][0];
        assert_eq!(ep["exit_node"], "my-exit-server");
    }

    #[test]
    fn advertise_routes_included_when_set() {
        let settings = TailscaleSettings {
            enabled: true,
            advertise_routes: vec![
                "192.168.1.0/24".to_string(),
                "10.0.0.0/8".to_string(),
            ],
            ..Default::default()
        };

        let config = build_tailscale_config(&settings).unwrap();
        let ep = &config["endpoints"][0];
        let routes = ep["advertise_routes"]
            .as_array()
            .expect("should have routes");
        assert_eq!(routes.len(), 2);
        assert_eq!(routes[0], "192.168.1.0/24");
        assert_eq!(routes[1], "10.0.0.0/8");
    }

    #[test]
    fn full_config_with_all_fields() {
        let settings = TailscaleSettings {
            enabled: true,
            auth_key: "tskey-auth-xyz".to_string(),
            hostname: "calamity-node".to_string(),
            exit_node: "exit-1".to_string(),
            accept_routes: true,
            advertise_routes: vec!["172.16.0.0/12".to_string()],
            ..Default::default()
        };

        let config = build_tailscale_config(&settings).unwrap();
        let ep = &config["endpoints"][0];
        assert_eq!(ep["type"], "tailscale");
        assert_eq!(ep["auth_key"], "tskey-auth-xyz");
        assert_eq!(ep["hostname"], "calamity-node");
        assert_eq!(ep["exit_node"], "exit-1");
        assert_eq!(ep["accept_routes"], true);
        assert_eq!(ep["advertise_routes"][0], "172.16.0.0/12");
        // state_directory should be an absolute path
        let state_dir = ep["state_directory"].as_str().unwrap();
        assert!(state_dir.ends_with("/tailscale"), "state_directory should end with /tailscale, got: {}", state_dir);
    }
}
