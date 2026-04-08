use serde::{Deserialize, Serialize};

use super::storage::{read_json, write_json};

const AI_AUTH_FILE: &str = "ai_auth.json";

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum AiAuthType {
    ApiKey,
    OAuth,
}

impl Default for AiAuthType {
    fn default() -> Self {
        Self::ApiKey
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum AiProvider {
    OpenAi,
    Anthropic,
    GoogleGemini,
}

impl AiProvider {
    /// Domains that this provider uses for API traffic.
    pub fn domains(&self) -> &[&str] {
        match self {
            Self::OpenAi => &["api.openai.com"],
            Self::Anthropic => &["api.anthropic.com"],
            Self::GoogleGemini => &["generativelanguage.googleapis.com"],
        }
    }

    /// Returns (header_name, header_value_template) for API key auth.
    /// The template contains `{key}` as placeholder.
    pub fn api_key_header(&self) -> (&str, &str) {
        match self {
            Self::OpenAi => ("Authorization", "Bearer {key}"),
            Self::Anthropic => ("x-api-key", "{key}"),
            Self::GoogleGemini => ("x-goog-api-key", "{key}"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiServiceConfig {
    pub id: String,
    pub provider: AiProvider,
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub auth_type: AiAuthType,
    // API key auth
    #[serde(default)]
    pub api_key: String,
    // OAuth auth
    #[serde(default)]
    pub oauth_client_id: String,
    #[serde(default)]
    pub oauth_client_secret: String,
    #[serde(default)]
    pub oauth_token_url: String,
    #[serde(default)]
    pub oauth_access_token: String,
    #[serde(default)]
    pub oauth_token_expires: String,
    #[serde(default)]
    pub oauth_scopes: String,
}

impl AiServiceConfig {
    /// Resolve the current auth token (API key or OAuth access token).
    pub fn resolve_token(&self) -> Option<String> {
        match self.auth_type {
            AiAuthType::ApiKey => {
                if self.api_key.is_empty() {
                    None
                } else {
                    Some(self.api_key.clone())
                }
            }
            AiAuthType::OAuth => {
                if self.oauth_access_token.is_empty() {
                    None
                } else {
                    Some(self.oauth_access_token.clone())
                }
            }
        }
    }

    /// Build the (header_name, header_value) pair for injection.
    pub fn auth_header(&self) -> Option<(String, String)> {
        let token = self.resolve_token()?;
        let (name, template) = self.provider.api_key_header();
        Some((name.to_string(), template.replace("{key}", &token)))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiAuthSettings {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "default_proxy_port")]
    pub proxy_port: u16,
    #[serde(default)]
    pub services: Vec<AiServiceConfig>,
}

impl Default for AiAuthSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            proxy_port: default_proxy_port(),
            services: Vec::new(),
        }
    }
}

fn default_proxy_port() -> u16 {
    8443
}

impl AiAuthSettings {
    /// Collect all domains from enabled services.
    pub fn enabled_domains(&self) -> Vec<String> {
        self.services
            .iter()
            .filter(|s| s.enabled)
            .flat_map(|s| s.provider.domains().iter().map(|d| d.to_string()))
            .collect()
    }

    /// Find the service config for a given host.
    pub fn find_service_for_host(&self, host: &str) -> Option<&AiServiceConfig> {
        self.services.iter().find(|s| {
            s.enabled && s.provider.domains().iter().any(|d| *d == host)
        })
    }
}

pub fn load_ai_auth_settings() -> AiAuthSettings {
    read_json(AI_AUTH_FILE)
}

pub fn save_ai_auth_settings(settings: &AiAuthSettings) -> Result<(), String> {
    write_json(AI_AUTH_FILE, settings)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_settings() {
        let settings = AiAuthSettings::default();
        assert!(!settings.enabled);
        assert_eq!(settings.proxy_port, 8443);
        assert!(settings.services.is_empty());
    }

    #[test]
    fn provider_domains() {
        assert_eq!(AiProvider::OpenAi.domains(), &["api.openai.com"]);
        assert_eq!(AiProvider::Anthropic.domains(), &["api.anthropic.com"]);
        assert_eq!(
            AiProvider::GoogleGemini.domains(),
            &["generativelanguage.googleapis.com"]
        );
    }

    #[test]
    fn auth_header_api_key() {
        let svc = AiServiceConfig {
            id: "1".into(),
            provider: AiProvider::OpenAi,
            enabled: true,
            auth_type: AiAuthType::ApiKey,
            api_key: "sk-test123".into(),
            oauth_client_id: String::new(),
            oauth_client_secret: String::new(),
            oauth_token_url: String::new(),
            oauth_access_token: String::new(),
            oauth_token_expires: String::new(),
            oauth_scopes: String::new(),
        };
        let (name, value) = svc.auth_header().unwrap();
        assert_eq!(name, "Authorization");
        assert_eq!(value, "Bearer sk-test123");
    }

    #[test]
    fn auth_header_anthropic() {
        let svc = AiServiceConfig {
            id: "2".into(),
            provider: AiProvider::Anthropic,
            enabled: true,
            auth_type: AiAuthType::ApiKey,
            api_key: "sk-ant-xxx".into(),
            oauth_client_id: String::new(),
            oauth_client_secret: String::new(),
            oauth_token_url: String::new(),
            oauth_access_token: String::new(),
            oauth_token_expires: String::new(),
            oauth_scopes: String::new(),
        };
        let (name, value) = svc.auth_header().unwrap();
        assert_eq!(name, "x-api-key");
        assert_eq!(value, "sk-ant-xxx");
    }

    #[test]
    fn enabled_domains_filters_disabled() {
        let settings = AiAuthSettings {
            enabled: true,
            proxy_port: 8443,
            services: vec![
                AiServiceConfig {
                    id: "1".into(),
                    provider: AiProvider::OpenAi,
                    enabled: true,
                    auth_type: AiAuthType::ApiKey,
                    api_key: "k".into(),
                    ..Default::default()
                },
                AiServiceConfig {
                    id: "2".into(),
                    provider: AiProvider::Anthropic,
                    enabled: false,
                    ..Default::default()
                },
            ],
        };
        let domains = settings.enabled_domains();
        assert_eq!(domains, vec!["api.openai.com"]);
    }
}

impl Default for AiServiceConfig {
    fn default() -> Self {
        Self {
            id: String::new(),
            provider: AiProvider::OpenAi,
            enabled: false,
            auth_type: AiAuthType::ApiKey,
            api_key: String::new(),
            oauth_client_id: String::new(),
            oauth_client_secret: String::new(),
            oauth_token_url: String::new(),
            oauth_access_token: String::new(),
            oauth_token_expires: String::new(),
            oauth_scopes: String::new(),
        }
    }
}
