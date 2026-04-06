use serde::{Deserialize, Serialize};

use super::storage::{read_json, write_json};

const DNS_FILE: &str = "dns.json";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum DnsMode {
    Normal,
    FakeIp,
    /// Legacy value from old configs, treated as Normal.
    #[serde(rename = "redir-host")]
    RedirHost,
}

impl Default for DnsMode {
    fn default() -> Self {
        Self::Normal
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DnsSettings {
    #[serde(default)]
    pub mode: DnsMode,
    pub fake_ip_range: String,
    #[serde(rename = "final")]
    pub final_server: String,
    pub servers: Vec<DnsServerConfig>,
    pub rules: Vec<DnsRuleConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DnsServerConfig {
    /// Legacy field, kept for backward compat with old dns.json. Use `name` as identifier.
    #[serde(default, skip_serializing)]
    pub id: Option<String>,
    pub name: String,
    pub address: String,
    pub enabled: bool,
    /// Outbound tag for DNS traffic. Omit or null = direct (default in 1.12+).
    /// Only set when routing DNS through a proxy outbound.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detour: Option<String>,
    /// Tag of another DNS server to resolve this server's domain name.
    /// Required when `address` contains a domain (e.g. dns.alidns.com).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub domain_resolver: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DnsRuleConfig {
    #[serde(default, skip_serializing)]
    pub id: Option<String>,
    pub match_type: String,
    pub match_value: String,
    pub server: String,
    pub enabled: bool,
}

impl Default for DnsSettings {
    fn default() -> Self {
        Self {
            mode: DnsMode::Normal,
            fake_ip_range: "198.18.0.0/15".to_string(),
            final_server: "AliDNS".to_string(),
            servers: vec![
                DnsServerConfig {
                    id: None,
                    name: "AliDNS".to_string(),
                    address: "https://dns.alidns.com/dns-query".to_string(),
                    enabled: true,
                    detour: None,
                    domain_resolver: Some("Bootstrap".to_string()),
                },
                DnsServerConfig {
                    id: None,
                    name: "Bootstrap".to_string(),
                    address: "223.5.5.5".to_string(),
                    enabled: true,
                    detour: None,
                    domain_resolver: None,
                },
                DnsServerConfig {
                    id: None,
                    name: "Tailscale".to_string(),
                    address: "100.100.100.100".to_string(),
                    enabled: true,
                    detour: None,
                    domain_resolver: None,
                },
            ],
            rules: vec![],
        }
    }
}

pub fn load_dns_settings() -> DnsSettings {
    read_json(DNS_FILE)
}

pub fn save_dns_settings(settings: &DnsSettings) -> Result<(), String> {
    write_json(DNS_FILE, settings)
}
