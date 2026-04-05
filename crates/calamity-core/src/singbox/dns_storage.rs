use serde::{Deserialize, Serialize};

use super::storage::{read_json, write_json};

const DNS_FILE: &str = "dns.json";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum DnsMode {
    Normal,
    FakeIp,
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
    pub id: String,
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
    pub id: String,
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
            final_server: "dns-direct".to_string(),
            servers: vec![
                DnsServerConfig {
                    id: "dns-proxy".to_string(),
                    name: "Cloudflare".to_string(),
                    address: "https://1.1.1.1/dns-query".to_string(),
                    enabled: false,
                    detour: None,
                    domain_resolver: None,
                },
                DnsServerConfig {
                    id: "dns-direct".to_string(),
                    name: "AliDNS".to_string(),
                    address: "https://dns.alidns.com/dns-query".to_string(),
                    enabled: true,
                    detour: None,
                    domain_resolver: Some("dns-resolver".to_string()),
                },
                DnsServerConfig {
                    id: "dns-resolver".to_string(),
                    name: "Bootstrap (223.5.5.5)".to_string(),
                    address: "223.5.5.5".to_string(),
                    enabled: true,
                    detour: None,
                    domain_resolver: None,
                },
                DnsServerConfig {
                    id: "tailscale".to_string(),
                    name: "Tailscale".to_string(),
                    address: "100.100.100.100".to_string(),
                    enabled: true,
                    detour: None,
                    domain_resolver: None,
                },
            ],
            rules: vec![
                DnsRuleConfig {
                    id: "cn-rule".to_string(),
                    match_type: "rule_set".to_string(),
                    match_value: "geosite-cn".to_string(),
                    server: "dns-direct".to_string(),
                    enabled: true,
                },
                DnsRuleConfig {
                    id: "not-cn-rule".to_string(),
                    match_type: "rule_set".to_string(),
                    match_value: "geosite-geolocation-!cn".to_string(),
                    server: "dns-proxy".to_string(),
                    enabled: true,
                },
                DnsRuleConfig {
                    id: "ts-rule".to_string(),
                    match_type: "domain-suffix".to_string(),
                    match_value: ".ts.net".to_string(),
                    server: "tailscale".to_string(),
                    enabled: true,
                },
            ],
        }
    }
}

pub fn load_dns_settings() -> DnsSettings {
    read_json(DNS_FILE)
}

pub fn save_dns_settings(settings: &DnsSettings) -> Result<(), String> {
    write_json(DNS_FILE, settings)
}
