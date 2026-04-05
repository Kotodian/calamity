use serde::{Deserialize, Serialize};

use super::tailscale_storage::{self, TailscaleSettings};

const TOKEN_URL: &str = "https://api.tailscale.com/api/v2/oauth/token";

#[derive(Debug, Deserialize)]
struct OAuthTokenResponse {
    access_token: String,
    expires_in: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TailscaleDevice {
    pub id: String,
    pub name: String,
    pub hostname: String,
    pub ip: String,
    pub os: String,
    pub status: String,
    pub last_seen: String,
    pub is_exit_node: bool,
    pub is_self: bool,
}

#[derive(Debug, Deserialize)]
struct ApiDevicesResponse {
    devices: Vec<ApiDevice>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ApiDevice {
    #[serde(rename = "nodeId")]
    node_id: String,
    #[serde(default)]
    name: String,
    hostname: String,
    addresses: Vec<String>,
    os: String,
    #[serde(default)]
    last_seen: String,
    /// API uses connectedToControl, not "online"
    #[serde(default, rename = "connectedToControl")]
    connected_to_control: bool,
    /// Advertised routes — only present on nodes advertising exit node
    #[serde(default, rename = "advertisedRoutes")]
    advertised_routes: Vec<String>,
    /// Whether this device is an approved exit node in the admin panel
    #[serde(default, rename = "enabledRoutes")]
    enabled_routes: Vec<String>,
}

/// Check if the cached OAuth token is still valid.
fn is_token_valid(settings: &TailscaleSettings) -> bool {
    if settings.oauth_access_token.is_empty() || settings.oauth_token_expires.is_empty() {
        return false;
    }
    match chrono::DateTime::parse_from_rfc3339(&settings.oauth_token_expires) {
        Ok(expires) => expires > chrono::Utc::now(),
        Err(_) => false,
    }
}

/// Fetch a fresh OAuth access token using client credentials.
async fn fetch_oauth_token(
    client_id: &str,
    client_secret: &str,
) -> Result<(String, String), String> {
    let client = reqwest::Client::new();
    let resp = client
        .post(TOKEN_URL)
        .basic_auth(client_id, Some(client_secret))
        .form(&[("grant_type", "client_credentials")])
        .send()
        .await
        .map_err(|e| format!("OAuth token request failed: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("OAuth token error {}: {}", status, body));
    }

    let token_resp: OAuthTokenResponse = resp
        .json()
        .await
        .map_err(|e| format!("OAuth token parse error: {}", e))?;

    let expires_at =
        chrono::Utc::now() + chrono::Duration::seconds(token_resp.expires_in as i64 - 60);
    Ok((token_resp.access_token, expires_at.to_rfc3339()))
}

/// Get a valid OAuth access token, refreshing if expired.
pub async fn get_oauth_token(settings: &mut TailscaleSettings) -> Result<String, String> {
    if settings.oauth_client_id.is_empty() || settings.oauth_client_secret.is_empty() {
        return Err("OAuth client credentials not configured".to_string());
    }

    if is_token_valid(settings) {
        return Ok(settings.oauth_access_token.clone());
    }

    let (token, expires) =
        fetch_oauth_token(&settings.oauth_client_id, &settings.oauth_client_secret).await?;
    settings.oauth_access_token = token.clone();
    settings.oauth_token_expires = expires;
    tailscale_storage::save_tailscale_settings(settings)?;

    Ok(token)
}

/// Map API device response to our TailscaleDevice type.
fn map_api_device(device: ApiDevice, our_hostname: &str) -> TailscaleDevice {
    let ip = device.addresses.first().cloned().unwrap_or_default();
    // Exit node: has 0.0.0.0/0 in enabled_routes (approved by admin)
    // or in advertised_routes (offered but maybe not approved)
    let is_exit = device
        .enabled_routes
        .iter()
        .chain(device.advertised_routes.iter())
        .any(|r| r == "0.0.0.0/0" || r == "::/0");
    let display_name = device
        .name
        .split('.')
        .next()
        .unwrap_or(&device.name)
        .to_string();
    let is_self = device.hostname.eq_ignore_ascii_case(our_hostname);

    TailscaleDevice {
        id: device.node_id,
        name: display_name,
        hostname: device.hostname,
        ip,
        os: device.os,
        status: if device.connected_to_control {
            "online"
        } else {
            "offline"
        }
        .to_string(),
        last_seen: device.last_seen,
        is_exit_node: is_exit,
        is_self,
    }
}

/// Create a pre-authorized auth key using the OAuth token.
/// This allows sing-box's embedded Tailscale to auto-register without interactive login.
pub async fn create_auth_key(settings: &mut TailscaleSettings) -> Result<String, String> {
    let token = get_oauth_token(settings).await?;
    let tailnet = if settings.tailnet.is_empty() {
        "-"
    } else {
        &settings.tailnet
    };

    let url = format!(
        "https://api.tailscale.com/api/v2/tailnet/{}/keys",
        tailnet
    );
    if settings.tags.is_empty() {
        return Err("Tags are required for OAuth auth key creation".to_string());
    }

    let body = serde_json::json!({
        "capabilities": {
            "devices": {
                "create": {
                    "reusable": true,
                    "ephemeral": false,
                    "preauthorized": true,
                    "tags": settings.tags
                }
            }
        },
        "expirySeconds": 86400
    });

    let client = reqwest::Client::new();
    let resp = client
        .post(&url)
        .bearer_auth(&token)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Create auth key failed: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Create auth key error {}: {}", status, body));
    }

    let resp_json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Parse auth key response: {}", e))?;

    resp_json["key"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "No key in auth key response".to_string())
}

/// Fetch devices from Tailscale API v2.
pub async fn fetch_devices(
    settings: &mut TailscaleSettings,
) -> Result<Vec<TailscaleDevice>, String> {
    let token = get_oauth_token(settings).await?;
    let tailnet = if settings.tailnet.is_empty() {
        "-"
    } else {
        &settings.tailnet
    };

    let url = format!(
        "https://api.tailscale.com/api/v2/tailnet/{}/devices",
        tailnet
    );
    let client = reqwest::Client::new();
    let resp = client
        .get(&url)
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Tailscale API request failed: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Tailscale API error {}: {}", status, body));
    }

    let api_resp: ApiDevicesResponse = resp
        .json()
        .await
        .map_err(|e| format!("Tailscale API parse error: {}", e))?;

    let devices: Vec<TailscaleDevice> = api_resp
        .devices
        .into_iter()
        .map(|d| map_api_device(d, &settings.hostname))
        // Filter out devices matching our hostname — cannot reliably identify
        // which one is the current instance due to sing-box re-registration
        .filter(|d| !d.is_self)
        .collect();

    Ok(devices)
}

/// Get the Tailscale IP of the current device via OAuth API.
pub async fn get_self_ip(settings: &mut TailscaleSettings) -> Option<std::net::Ipv4Addr> {
    let token = get_oauth_token(settings).await.ok()?;
    let tailnet = if settings.tailnet.is_empty() { "-" } else { &settings.tailnet };
    let url = format!(
        "https://api.tailscale.com/api/v2/tailnet/{}/devices",
        tailnet
    );
    let resp = reqwest::Client::new()
        .get(&url)
        .bearer_auth(&token)
        .send()
        .await
        .ok()?;
    let api_resp: ApiDevicesResponse = resp.json().await.ok()?;

    for device in api_resp.devices {
        let mapped = map_api_device(device, &settings.hostname);
        if mapped.is_self && !mapped.ip.is_empty() {
            return mapped.ip.parse().ok();
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn is_token_valid_returns_false_for_empty_token() {
        let settings = TailscaleSettings::default();
        assert!(!is_token_valid(&settings));
    }

    #[test]
    fn is_token_valid_returns_false_for_expired_token() {
        let settings = TailscaleSettings {
            oauth_access_token: "some-token".to_string(),
            oauth_token_expires: "2020-01-01T00:00:00Z".to_string(),
            ..Default::default()
        };
        assert!(!is_token_valid(&settings));
    }

    #[test]
    fn is_token_valid_returns_true_for_future_expiry() {
        let future = (chrono::Utc::now() + chrono::Duration::hours(1)).to_rfc3339();
        let settings = TailscaleSettings {
            oauth_access_token: "some-token".to_string(),
            oauth_token_expires: future,
            ..Default::default()
        };
        assert!(is_token_valid(&settings));
    }

    #[test]
    fn is_token_valid_returns_false_for_invalid_date() {
        let settings = TailscaleSettings {
            oauth_access_token: "some-token".to_string(),
            oauth_token_expires: "not-a-date".to_string(),
            ..Default::default()
        };
        assert!(!is_token_valid(&settings));
    }

    #[test]
    fn map_api_device_extracts_display_name_from_fqdn() {
        let device = ApiDevice {
            node_id: "node-123".to_string(),
            name: "my-server.tail12345.ts.net.".to_string(),
            hostname: "my-server".to_string(),
            addresses: vec!["100.64.0.1".to_string(), "fd7a::1".to_string()],
            os: "linux".to_string(),
            last_seen: "2026-03-31T12:00:00Z".to_string(),
            connected_to_control: true,
            advertised_routes: vec![],
            enabled_routes: vec![],
        };

        let result = map_api_device(device, "other-host");
        assert_eq!(result.name, "my-server");
        assert_eq!(result.ip, "100.64.0.1");
        assert_eq!(result.status, "online");
        assert!(!result.is_exit_node);
        assert!(!result.is_self);
    }

    #[test]
    fn map_api_device_detects_exit_node() {
        let device = ApiDevice {
            node_id: "node-456".to_string(),
            name: "exit-server".to_string(),
            hostname: "exit-server".to_string(),
            addresses: vec!["100.64.0.2".to_string()],
            os: "linux".to_string(),
            last_seen: String::new(),
            connected_to_control: false,
            advertised_routes: vec![],
            enabled_routes: vec![
                "100.64.0.2/32".to_string(),
                "0.0.0.0/0".to_string(),
                "::/0".to_string(),
            ],
        };

        let result = map_api_device(device, "other");
        assert!(result.is_exit_node);
        assert_eq!(result.status, "offline");
    }

    #[test]
    fn map_api_device_detects_self() {
        let device = ApiDevice {
            node_id: "node-789".to_string(),
            name: "calamity.tail12345.ts.net.".to_string(),
            hostname: "Calamity".to_string(),
            addresses: vec!["100.64.0.3".to_string()],
            os: "macOS".to_string(),
            last_seen: String::new(),
            connected_to_control: true,
            advertised_routes: vec![],
            enabled_routes: vec![],
        };

        let result = map_api_device(device, "calamity");
        assert!(result.is_self);
    }

    #[test]
    fn map_api_device_handles_empty_addresses() {
        let device = ApiDevice {
            node_id: "node-empty".to_string(),
            name: "no-ip".to_string(),
            hostname: "no-ip".to_string(),
            addresses: vec![],
            os: "linux".to_string(),
            last_seen: String::new(),
            connected_to_control: false,
            advertised_routes: vec![],
            enabled_routes: vec![],
        };

        let result = map_api_device(device, "other");
        assert_eq!(result.ip, "");
    }

    #[test]
    fn deserialize_api_devices_response() {
        let json = r#"{
            "devices": [
                {
                    "nodeId": "n1",
                    "name": "server.tail123.ts.net.",
                    "hostname": "server",
                    "addresses": ["100.64.0.1"],
                    "os": "linux",
                    "lastSeen": "2026-03-31T00:00:00Z",
                    "connectedToControl": true,
                    "enabledRoutes": ["0.0.0.0/0", "::/0"]
                },
                {
                    "nodeId": "n2",
                    "name": "laptop",
                    "hostname": "laptop",
                    "addresses": ["100.64.0.2"],
                    "os": "macOS",
                    "connectedToControl": false
                }
            ]
        }"#;

        let resp: ApiDevicesResponse =
            serde_json::from_str(json).expect("should parse API response");
        assert_eq!(resp.devices.len(), 2);
        assert_eq!(resp.devices[0].node_id, "n1");
        assert!(resp.devices[0].connected_to_control);
        assert_eq!(resp.devices[0].enabled_routes.len(), 2);
        assert_eq!(resp.devices[1].node_id, "n2");
        assert!(!resp.devices[1].connected_to_control);
        assert!(resp.devices[1].enabled_routes.is_empty());
    }

    #[tokio::test]
    async fn get_oauth_token_fails_without_credentials() {
        let mut settings = TailscaleSettings::default();
        let result = get_oauth_token(&mut settings).await;
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .contains("OAuth client credentials not configured"));
    }

    #[tokio::test]
    async fn get_oauth_token_returns_cached_if_valid() {
        let future = (chrono::Utc::now() + chrono::Duration::hours(1)).to_rfc3339();
        let mut settings = TailscaleSettings {
            oauth_client_id: "test-id".to_string(),
            oauth_client_secret: "test-secret".to_string(),
            oauth_access_token: "cached-token".to_string(),
            oauth_token_expires: future,
            ..Default::default()
        };

        let result = get_oauth_token(&mut settings).await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "cached-token");
    }
}
