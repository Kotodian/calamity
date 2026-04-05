use reqwest::Client;
use serde::Deserialize;
use serde_json::Value;

const BASE_URL: &str = "http://127.0.0.1:9091";

pub struct ClashApi {
    client: Client,
}

#[derive(Debug, Deserialize)]
pub struct LogMessage {
    #[serde(rename = "type")]
    pub level: String,
    pub payload: String,
}

#[derive(Debug, Deserialize)]
pub struct VersionInfo {
    pub version: String,
}

impl ClashApi {
    pub fn new() -> Self {
        Self {
            client: Client::new(),
        }
    }

    pub async fn health_check(&self) -> Result<bool, String> {
        let resp = self
            .client
            .get(format!("{}/", BASE_URL))
            .send()
            .await
            .map_err(|e| e.to_string())?;
        Ok(resp.status().is_success())
    }

    pub async fn version(&self) -> Result<VersionInfo, String> {
        self.client
            .get(format!("{}/version", BASE_URL))
            .send()
            .await
            .map_err(|e| e.to_string())?
            .json()
            .await
            .map_err(|e| e.to_string())
    }

    pub async fn test_delay(&self, proxy_name: &str, timeout: u64) -> Result<u64, String> {
        let url = format!(
            "{}/proxies/{}/delay?url={}&timeout={}",
            BASE_URL, proxy_name, "http://cp.cloudflare.com/generate_204", timeout
        );
        let resp = self
            .client
            .get(&url)
            .send()
            .await
            .map_err(|e| e.to_string())?;
        if !resp.status().is_success() {
            return Err(format!("delay test failed: {}", resp.status()));
        }
        let body: Value = resp.json().await.map_err(|e| e.to_string())?;
        body.get("delay")
            .and_then(|v| v.as_u64())
            .ok_or_else(|| "no delay in response".to_string())
    }

    pub async fn logs_stream(&self, level: &str) -> Result<reqwest::Response, String> {
        self.client
            .get(format!("{}/logs?level={}", BASE_URL, level))
            .send()
            .await
            .map_err(|e| e.to_string())
    }

    /// GET /traffic — streaming endpoint, returns {"up": bytes_per_sec, "down": bytes_per_sec} per line
    pub async fn traffic_stream(&self) -> Result<reqwest::Response, String> {
        self.client
            .get(format!("{}/traffic", BASE_URL))
            .send()
            .await
            .map_err(|e| e.to_string())
    }

    /// GET /connections — returns snapshot of all connections + totals
    pub async fn get_connections(&self) -> Result<Value, String> {
        self.client
            .get(format!("{}/connections", BASE_URL))
            .send()
            .await
            .map_err(|e| e.to_string())?
            .json()
            .await
            .map_err(|e| e.to_string())
    }

    /// DELETE /connections/{id} — close a specific connection
    pub async fn close_connection(&self, id: &str) -> Result<(), String> {
        self.client
            .delete(format!("{}/connections/{}", BASE_URL, id))
            .send()
            .await
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    /// DELETE /connections — close all connections
    pub async fn close_all_connections(&self) -> Result<(), String> {
        self.client
            .delete(format!("{}/connections", BASE_URL))
            .send()
            .await
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    /// GET /memory — returns {"inuse": bytes, "oslimit": bytes}
    pub async fn get_memory(&self) -> Result<Value, String> {
        self.client
            .get(format!("{}/memory", BASE_URL))
            .send()
            .await
            .map_err(|e| e.to_string())?
            .json()
            .await
            .map_err(|e| e.to_string())
    }
}
