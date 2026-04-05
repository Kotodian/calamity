use serde::{de::DeserializeOwned, Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

pub fn app_data_dir() -> PathBuf {
    let base = dirs::data_dir().expect("no data dir");
    let dir = base.join("com.calamity.app");
    fs::create_dir_all(&dir).expect("failed to create app data dir");
    dir
}

pub fn singbox_config_path() -> PathBuf {
    app_data_dir().join("singbox-config.json")
}

pub fn singbox_config_dir() -> PathBuf {
    app_data_dir().join("singbox-config.d")
}

pub fn read_json<T: DeserializeOwned + Default>(filename: &str) -> T {
    let path = app_data_dir().join(filename);
    match fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
        Err(_) => T::default(),
    }
}

pub fn write_json<T: Serialize>(filename: &str, data: &T) -> Result<(), String> {
    let path = app_data_dir().join(filename);
    let content = serde_json::to_string_pretty(data).map_err(|e| e.to_string())?;
    fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TunConfig {
    pub stack: String,
    pub mtu: u16,
    pub auto_route: bool,
    pub strict_route: bool,
    pub dns_hijack: Vec<String>,
}

impl Default for TunConfig {
    fn default() -> Self {
        Self {
            stack: "system".to_string(),
            mtu: 1500,
            auto_route: true,
            strict_route: false,
            dns_hijack: vec!["198.18.0.2:53".to_string()],
        }
    }
}

fn default_language() -> String {
    "system".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub theme: String,
    #[serde(default = "default_language")]
    pub language: String,
    pub singbox_path: String,
    pub auto_start: bool,
    pub system_proxy: bool,
    pub enhanced_mode: bool,
    pub tun_config: TunConfig,
    pub allow_lan: bool,
    #[serde(default)]
    pub gateway_mode: bool,
    pub http_port: u16,
    pub socks_port: u16,
    pub mixed_port: u16,
    pub log_level: String,
    #[serde(default = "default_proxy_mode")]
    pub proxy_mode: String,
}

fn default_proxy_mode() -> String {
    "rule".to_string()
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: "dark".to_string(),
            language: default_language(),
            singbox_path: "sing-box".to_string(),
            auto_start: false,
            system_proxy: true,
            enhanced_mode: false,
            tun_config: TunConfig::default(),
            allow_lan: false,
            gateway_mode: false,
            http_port: 7890,
            socks_port: 7891,
            mixed_port: 7893,
            log_level: "info".to_string(),
            proxy_mode: default_proxy_mode(),
        }
    }
}

const SETTINGS_FILE: &str = "settings.json";

pub fn load_settings() -> AppSettings {
    read_json(SETTINGS_FILE)
}

pub fn save_settings(settings: &AppSettings) -> Result<(), String> {
    write_json(SETTINGS_FILE, settings)
}

#[cfg(test)]
mod tests {
    use super::AppSettings;

    #[test]
    fn old_settings_json_defaults_language_without_resetting_other_fields() {
        let json = r#"{
            "theme": "light",
            "singboxPath": "/usr/local/bin/sing-box",
            "autoStart": true,
            "systemProxy": false,
            "enhancedMode": true,
            "tunConfig": {
                "stack": "mixed",
                "mtu": 1500,
                "autoRoute": false,
                "strictRoute": true,
                "dnsHijack": ["198.18.0.2:53"]
            },
            "allowLan": true,
            "httpPort": 8080,
            "socksPort": 1080,
            "mixedPort": 7890,
            "logLevel": "debug"
        }"#;

        let settings: AppSettings =
            serde_json::from_str(json).expect("old settings should still deserialize");

        assert_eq!(settings.language, "system");
        assert_eq!(settings.theme, "light");
        assert_eq!(settings.singbox_path, "/usr/local/bin/sing-box");
        assert!(settings.auto_start);
        assert!(!settings.system_proxy);
        assert!(settings.enhanced_mode);
        assert_eq!(settings.tun_config.stack, "mixed");
        assert_eq!(settings.tun_config.mtu, 1500);
        assert!(!settings.tun_config.auto_route);
        assert!(settings.tun_config.strict_route);
        assert!(settings.allow_lan);
        assert_eq!(settings.http_port, 8080);
        assert_eq!(settings.socks_port, 1080);
        assert_eq!(settings.mixed_port, 7890);
        assert_eq!(settings.log_level, "debug");
    }

    #[test]
    fn old_settings_json_defaults_gateway_mode_to_false() {
        let json = r#"{
            "theme": "dark",
            "singboxPath": "sing-box",
            "autoStart": false,
            "systemProxy": true,
            "enhancedMode": false,
            "tunConfig": {
                "stack": "system",
                "mtu": 9000,
                "autoRoute": true,
                "strictRoute": false,
                "dnsHijack": ["198.18.0.2:53"]
            },
            "allowLan": false,
            "httpPort": 7890,
            "socksPort": 7891,
            "mixedPort": 7893,
            "logLevel": "info"
        }"#;

        let settings: AppSettings =
            serde_json::from_str(json).expect("old settings should still deserialize");
        assert!(!settings.gateway_mode);
    }
}
