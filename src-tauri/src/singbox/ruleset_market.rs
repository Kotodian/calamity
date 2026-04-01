use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

use super::storage;

const CACHE_FILE: &str = "ruleset_market_cache.json";
const CACHE_TTL_SECS: u64 = 86400; // 24 hours
const GITHUB_API_URL: &str =
    "https://api.github.com/repos/Kotodian/singbox_ruleset/contents/rule";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuleSetEntry {
    pub name: String,
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct CachedRuleSetList {
    pub entries: Vec<RuleSetEntry>,
    pub fetched_at: u64,
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn load_cache() -> Option<CachedRuleSetList> {
    let cached: CachedRuleSetList = storage::read_json(CACHE_FILE);
    if cached.entries.is_empty() {
        return None;
    }
    if now_secs() - cached.fetched_at > CACHE_TTL_SECS {
        return None;
    }
    Some(cached)
}

fn save_cache(entries: &[RuleSetEntry]) -> Result<(), String> {
    let cached = CachedRuleSetList {
        entries: entries.to_vec(),
        fetched_at: now_secs(),
    };
    storage::write_json(CACHE_FILE, &cached)
}

pub fn build_srs_url(name: &str) -> String {
    format!(
        "https://raw.githubusercontent.com/Kotodian/singbox_ruleset/main/rule/{}/{}.srs",
        name, name
    )
}

#[derive(Deserialize)]
struct GithubDirEntry {
    name: String,
    #[serde(rename = "type")]
    entry_type: String,
}

pub async fn get_ruleset_list() -> Result<Vec<RuleSetEntry>, String> {
    // Return cache if fresh
    if let Some(cached) = load_cache() {
        return Ok(cached.entries);
    }

    // Fetch from GitHub API
    let client = reqwest::Client::new();
    let resp = client
        .get(GITHUB_API_URL)
        .header("User-Agent", "Calamity")
        .header("Accept", "application/vnd.github.v3+json")
        .send()
        .await
        .map_err(|e| format!("GitHub API request failed: {}", e))?;

    if !resp.status().is_success() {
        // If API fails but we have stale cache, use it
        let stale: CachedRuleSetList = storage::read_json(CACHE_FILE);
        if !stale.entries.is_empty() {
            return Ok(stale.entries);
        }
        return Err(format!("GitHub API returned {}", resp.status()));
    }

    let dirs: Vec<GithubDirEntry> = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse GitHub response: {}", e))?;

    let entries: Vec<RuleSetEntry> = dirs
        .into_iter()
        .filter(|d| d.entry_type == "dir")
        .map(|d| {
            let url = build_srs_url(&d.name);
            RuleSetEntry {
                name: d.name,
                url,
            }
        })
        .collect();

    let _ = save_cache(&entries);
    Ok(entries)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_srs_url_generates_correct_url() {
        let url = build_srs_url("Google");
        assert_eq!(
            url,
            "https://raw.githubusercontent.com/Kotodian/singbox_ruleset/main/rule/Google/Google.srs"
        );
    }

    #[test]
    fn build_srs_url_handles_names_with_special_chars() {
        let url = build_srs_url("ChinaMax");
        assert!(url.contains("/ChinaMax/ChinaMax.srs"));
    }

    #[test]
    fn cached_list_deserializes_correctly() {
        let json = r#"{
            "entries": [
                {"name": "Google", "url": "https://example.com/Google.srs"},
                {"name": "Netflix", "url": "https://example.com/Netflix.srs"}
            ],
            "fetchedAt": 1000000
        }"#;

        let cached: CachedRuleSetList =
            serde_json::from_str(json).expect("should deserialize cached list");
        assert_eq!(cached.entries.len(), 2);
        assert_eq!(cached.entries[0].name, "Google");
        assert_eq!(cached.fetched_at, 1000000);
    }

    #[test]
    fn empty_cache_deserializes_to_default() {
        let json = r#"{"entries": [], "fetchedAt": 0}"#;
        let cached: CachedRuleSetList =
            serde_json::from_str(json).expect("should deserialize empty cache");
        assert!(cached.entries.is_empty());
    }
}
