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
            mtu: 9000,
            auto_route: true,
            strict_route: false,
            dns_hijack: vec!["198.18.0.2:53".to_string()],
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub theme: String,
    pub singbox_path: String,
    pub auto_start: bool,
    pub system_proxy: bool,
    pub enhanced_mode: bool,
    pub tun_config: TunConfig,
    pub allow_lan: bool,
    pub http_port: u16,
    pub socks_port: u16,
    pub mixed_port: u16,
    pub log_level: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: "dark".to_string(),
            singbox_path: "sing-box".to_string(),
            auto_start: false,
            system_proxy: true,
            enhanced_mode: false,
            tun_config: TunConfig::default(),
            allow_lan: false,
            http_port: 7890,
            socks_port: 7891,
            mixed_port: 7893,
            log_level: "info".to_string(),
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
