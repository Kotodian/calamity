use super::ai_auth_storage::{AiAuthType, AiServiceConfig, load_ai_auth_settings, save_ai_auth_settings};

/// Check if an OAuth token needs refresh (expired or missing).
pub fn needs_refresh(svc: &AiServiceConfig) -> bool {
    if svc.auth_type != AiAuthType::OAuth {
        return false;
    }
    if svc.oauth_access_token.is_empty() {
        return true;
    }
    // Parse oauth_token_expires as RFC3339, check if expired
    chrono::DateTime::parse_from_rfc3339(&svc.oauth_token_expires)
        .map(|dt| chrono::Utc::now() > dt.with_timezone(&chrono::Utc))
        .unwrap_or(true)
}

/// Refresh OAuth token using client_credentials grant.
pub async fn refresh_token(svc: &mut AiServiceConfig) -> Result<(), String> {
    if svc.oauth_token_url.is_empty() {
        return Err("OAuth token URL not configured".into());
    }

    let client = reqwest::Client::new();
    let mut params = std::collections::HashMap::new();
    params.insert("grant_type", "client_credentials");
    params.insert("client_id", &svc.oauth_client_id);
    params.insert("client_secret", &svc.oauth_client_secret);
    if !svc.oauth_scopes.is_empty() {
        params.insert("scope", &svc.oauth_scopes);
    }

    let resp = client
        .post(&svc.oauth_token_url)
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("OAuth request failed: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("OAuth failed ({status}): {body}"));
    }

    let data: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("parse OAuth response: {e}"))?;

    let access_token = data["access_token"]
        .as_str()
        .ok_or("missing access_token in response")?;
    let expires_in = data["expires_in"].as_u64().unwrap_or(3600);

    svc.oauth_access_token = access_token.to_string();
    svc.oauth_token_expires =
        (chrono::Utc::now() + chrono::Duration::seconds(expires_in as i64)).to_rfc3339();

    log::info!("OAuth token refreshed, expires in {}s", expires_in);
    Ok(())
}

/// Refresh all OAuth tokens that need it, saving settings afterward.
pub async fn refresh_all_if_needed() -> Result<(), String> {
    let mut settings = load_ai_auth_settings();
    let mut changed = false;

    for svc in &mut settings.services {
        if svc.enabled && needs_refresh(svc) {
            match refresh_token(svc).await {
                Ok(()) => {
                    changed = true;
                }
                Err(e) => {
                    log::error!("OAuth refresh for {:?} failed: {e}", svc.provider);
                }
            }
        }
    }

    if changed {
        save_ai_auth_settings(&settings)?;
    }
    Ok(())
}
