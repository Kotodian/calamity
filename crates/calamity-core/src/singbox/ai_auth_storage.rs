use serde::{Deserialize, Serialize};

use super::storage::{read_json, write_json};

const AI_AUTH_FILE: &str = "ai_auth.json";

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum AiProvider {
    OpenAi,
    Anthropic,
    GoogleGemini,
}

impl AiProvider {
    pub const ALL: &[AiProvider] = &[
        AiProvider::OpenAi,
        AiProvider::Anthropic,
        AiProvider::GoogleGemini,
    ];

    pub fn name(&self) -> &str {
        match self {
            Self::OpenAi => "OpenAI",
            Self::Anthropic => "Anthropic",
            Self::GoogleGemini => "Google Gemini",
        }
    }

    /// API domains to intercept.
    pub fn domains(&self) -> &[&str] {
        match self {
            Self::OpenAi => &["api.openai.com"],
            Self::Anthropic => &["api.anthropic.com"],
            Self::GoogleGemini => &["generativelanguage.googleapis.com"],
        }
    }

    /// (header_name, value_template) — `{key}` is replaced with the credential.
    pub fn auth_header_template(&self) -> (&str, &str) {
        match self {
            Self::OpenAi => ("Authorization", "Bearer {key}"),
            Self::Anthropic => ("x-api-key", "{key}"),
            Self::GoogleGemini => ("x-goog-api-key", "{key}"),
        }
    }

    /// Try to discover a credential from the local system.
    /// Checks env vars first, then well-known config files.
    pub fn discover_credential(&self) -> Option<String> {
        match self {
            Self::OpenAi => discover_openai_key(),
            Self::Anthropic => discover_anthropic_key(),
            Self::GoogleGemini => discover_gemini_key(),
        }
    }

    /// Build the auth header using a discovered or cached credential.
    pub fn auth_header(&self) -> Option<(String, String)> {
        let key = self.discover_credential()?;
        let (name, template) = self.auth_header_template();
        Some((name.to_string(), template.replace("{key}", &key)))
    }
}

/// Settings stored in `ai_auth.json` — only toggle and provider list.
/// Credentials are NOT stored here; they're discovered at runtime.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiAuthSettings {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "default_proxy_port")]
    pub proxy_port: u16,
    /// Which providers are enabled for LAN auth sharing.
    #[serde(default)]
    pub providers: Vec<AiProvider>,
}

impl Default for AiAuthSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            proxy_port: default_proxy_port(),
            providers: Vec::new(),
        }
    }
}

fn default_proxy_port() -> u16 {
    443
}

/// Status of a provider's credential (for UI display).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderStatus {
    pub provider: AiProvider,
    pub name: String,
    pub enabled: bool,
    pub credential_found: bool,
    pub source: String,
}

impl AiAuthSettings {
    /// Collect all domains from enabled providers.
    pub fn enabled_domains(&self) -> Vec<String> {
        self.providers
            .iter()
            .flat_map(|p| p.domains().iter().map(|d| d.to_string()))
            .collect()
    }

    /// Find the provider for a given host.
    pub fn find_provider_for_host(&self, host: &str) -> Option<AiProvider> {
        self.providers
            .iter()
            .find(|p| p.domains().iter().any(|d| *d == host))
            .copied()
    }

    /// Scan all providers and report their credential status.
    pub fn scan_providers(&self) -> Vec<ProviderStatus> {
        AiProvider::ALL
            .iter()
            .map(|p| {
                let enabled = self.providers.contains(p);
                let (found, source) = detect_credential_source(p);
                ProviderStatus {
                    provider: *p,
                    name: p.name().to_string(),
                    enabled,
                    credential_found: found,
                    source,
                }
            })
            .collect()
    }
}

pub fn load_ai_auth_settings() -> AiAuthSettings {
    read_json(AI_AUTH_FILE)
}

pub fn save_ai_auth_settings(settings: &AiAuthSettings) -> Result<(), String> {
    write_json(AI_AUTH_FILE, settings)
}

// ── Credential discovery ────────────────────────────────────────────

fn discover_openai_key() -> Option<String> {
    // 1. Env var
    if let Ok(key) = std::env::var("OPENAI_API_KEY") {
        if !key.is_empty() {
            return Some(key);
        }
    }
    // 2. ~/.codex/auth.json → {"token": "..."}
    if let Some(home) = dirs::home_dir() {
        let path = home.join(".codex/auth.json");
        if let Ok(data) = std::fs::read_to_string(&path) {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&data) {
                if let Some(token) = json.get("token").and_then(|v| v.as_str()) {
                    if !token.is_empty() {
                        return Some(token.to_string());
                    }
                }
            }
        }
    }
    None
}

fn discover_anthropic_key() -> Option<String> {
    // 1. Env var
    if let Ok(key) = std::env::var("ANTHROPIC_API_KEY") {
        if !key.is_empty() {
            return Some(key);
        }
    }
    // 2. macOS keychain
    #[cfg(target_os = "macos")]
    {
        if let Some(key) = read_macos_keychain("ANTHROPIC_API_KEY") {
            return Some(key);
        }
    }
    // 3. ~/.claude/.credentials.json
    if let Some(home) = dirs::home_dir() {
        let path = home.join(".claude/.credentials.json");
        if let Ok(data) = std::fs::read_to_string(&path) {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&data) {
                // Try common key names
                for key_name in &["apiKey", "api_key", "token"] {
                    if let Some(val) = json.get(*key_name).and_then(|v| v.as_str()) {
                        if !val.is_empty() {
                            return Some(val.to_string());
                        }
                    }
                }
            }
        }
    }
    None
}

fn discover_gemini_key() -> Option<String> {
    // 1. Env vars
    for var in &["GEMINI_API_KEY", "GOOGLE_API_KEY"] {
        if let Ok(key) = std::env::var(var) {
            if !key.is_empty() {
                return Some(key);
            }
        }
    }
    // 2. ~/.gemini/.env → GEMINI_API_KEY=xxx
    if let Some(home) = dirs::home_dir() {
        let path = home.join(".gemini/.env");
        if let Ok(data) = std::fs::read_to_string(&path) {
            for line in data.lines() {
                let line = line.trim();
                if let Some(val) = line.strip_prefix("GEMINI_API_KEY=") {
                    let val = val.trim().trim_matches('"').trim_matches('\'');
                    if !val.is_empty() {
                        return Some(val.to_string());
                    }
                }
                if let Some(val) = line.strip_prefix("GOOGLE_API_KEY=") {
                    let val = val.trim().trim_matches('"').trim_matches('\'');
                    if !val.is_empty() {
                        return Some(val.to_string());
                    }
                }
            }
        }
    }
    // 3. gcloud ADC
    if let Some(home) = dirs::home_dir() {
        let path = home.join(".config/gcloud/application_default_credentials.json");
        if let Ok(data) = std::fs::read_to_string(&path) {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&data) {
                // ADC has client_id/client_secret/refresh_token, not a direct API key.
                // We'd need OAuth flow for this; skip for now.
                if let Some(token) = json.get("access_token").and_then(|v| v.as_str()) {
                    if !token.is_empty() {
                        return Some(token.to_string());
                    }
                }
            }
        }
    }
    None
}

#[cfg(target_os = "macos")]
fn read_macos_keychain(service: &str) -> Option<String> {
    let output = std::process::Command::new("security")
        .args(["find-generic-password", "-s", service, "-w"])
        .output()
        .ok()?;
    if output.status.success() {
        let val = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !val.is_empty() {
            return Some(val);
        }
    }
    None
}

/// Detect where a credential would come from (for UI status display).
fn detect_credential_source(provider: &AiProvider) -> (bool, String) {
    match provider {
        AiProvider::OpenAi => {
            if std::env::var("OPENAI_API_KEY").is_ok_and(|k| !k.is_empty()) {
                return (true, "env:OPENAI_API_KEY".into());
            }
            if let Some(home) = dirs::home_dir() {
                let path = home.join(".codex/auth.json");
                if path.exists() {
                    if discover_openai_key().is_some() {
                        return (true, "~/.codex/auth.json".into());
                    }
                }
            }
            (false, String::new())
        }
        AiProvider::Anthropic => {
            if std::env::var("ANTHROPIC_API_KEY").is_ok_and(|k| !k.is_empty()) {
                return (true, "env:ANTHROPIC_API_KEY".into());
            }
            #[cfg(target_os = "macos")]
            {
                if read_macos_keychain("ANTHROPIC_API_KEY").is_some() {
                    return (true, "macOS Keychain".into());
                }
            }
            if let Some(home) = dirs::home_dir() {
                let path = home.join(".claude/.credentials.json");
                if path.exists() {
                    if discover_anthropic_key().is_some() {
                        return (true, "~/.claude/.credentials.json".into());
                    }
                }
            }
            (false, String::new())
        }
        AiProvider::GoogleGemini => {
            for var in &["GEMINI_API_KEY", "GOOGLE_API_KEY"] {
                if std::env::var(var).is_ok_and(|k| !k.is_empty()) {
                    return (true, format!("env:{var}"));
                }
            }
            if let Some(home) = dirs::home_dir() {
                let path = home.join(".gemini/.env");
                if path.exists() {
                    if discover_gemini_key().is_some() {
                        return (true, "~/.gemini/.env".into());
                    }
                }
                let path = home.join(".config/gcloud/application_default_credentials.json");
                if path.exists() {
                    return (true, "gcloud ADC".into());
                }
            }
            (false, String::new())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_settings() {
        let settings = AiAuthSettings::default();
        assert!(!settings.enabled);
        assert_eq!(settings.proxy_port, 443);
        assert!(settings.providers.is_empty());
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
    fn enabled_domains_from_providers() {
        let settings = AiAuthSettings {
            enabled: true,
            proxy_port: 443,
            providers: vec![AiProvider::OpenAi, AiProvider::Anthropic],
        };
        let domains = settings.enabled_domains();
        assert_eq!(domains, vec!["api.openai.com", "api.anthropic.com"]);
    }

    #[test]
    fn find_provider_for_host() {
        let settings = AiAuthSettings {
            enabled: true,
            proxy_port: 443,
            providers: vec![AiProvider::OpenAi],
        };
        assert_eq!(
            settings.find_provider_for_host("api.openai.com"),
            Some(AiProvider::OpenAi)
        );
        assert_eq!(settings.find_provider_for_host("api.anthropic.com"), None);
    }

    #[test]
    fn scan_providers_lists_all() {
        let settings = AiAuthSettings::default();
        let statuses = settings.scan_providers();
        assert_eq!(statuses.len(), 3);
        assert_eq!(statuses[0].name, "OpenAI");
        assert_eq!(statuses[1].name, "Anthropic");
        assert_eq!(statuses[2].name, "Google Gemini");
    }
}
