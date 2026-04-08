use crate::singbox::ai_auth_storage::{self, AiAuthSettings};
use crate::singbox::ai_auth_ca;
use crate::singbox::ai_auth_api;
use std::sync::Arc;
use tauri::{AppHandle, Manager};
use crate::singbox::process::SingboxProcess;
use crate::singbox::storage;

#[tauri::command]
pub async fn ai_auth_get_settings() -> Result<AiAuthSettings, String> {
    Ok(ai_auth_storage::load_ai_auth_settings())
}

#[tauri::command]
pub async fn ai_auth_update_settings(app: AppHandle, settings: AiAuthSettings) -> Result<(), String> {
    ai_auth_storage::save_ai_auth_settings(&settings)?;

    // Reload sing-box to pick up DNS config changes
    let process = app.state::<Arc<SingboxProcess>>().inner().clone();
    let app_settings = storage::load_settings();
    let _ = process.reload(&app_settings).await;

    Ok(())
}

#[tauri::command]
pub async fn ai_auth_install_ca_cert() -> Result<(), String> {
    ai_auth_ca::ensure_ca_exists()?;
    ai_auth_ca::install_ca_cert_local()
}

#[tauri::command]
pub async fn ai_auth_export_ca_cert() -> Result<String, String> {
    ai_auth_ca::ensure_ca_exists()?;
    Ok(ai_auth_ca::ca_cert_path().to_string_lossy().to_string())
}

#[tauri::command]
pub async fn ai_auth_refresh_tokens() -> Result<(), String> {
    ai_auth_api::refresh_all_if_needed().await
}

#[tauri::command]
pub async fn ai_auth_test(provider: String) -> Result<String, String> {
    // Make a simple test request through the reverse proxy to verify auth injection
    let settings = ai_auth_storage::load_ai_auth_settings();
    let svc = settings.services.iter()
        .find(|s| format!("{:?}", s.provider).to_lowercase().contains(&provider.to_lowercase()))
        .ok_or_else(|| format!("provider '{provider}' not found"))?;

    let (header_name, header_value) = svc.auth_header()
        .ok_or("no auth credentials configured")?;

    let test_url = match svc.provider {
        ai_auth_storage::AiProvider::OpenAi => "https://api.openai.com/v1/models",
        ai_auth_storage::AiProvider::Anthropic => "https://api.anthropic.com/v1/models",
        ai_auth_storage::AiProvider::GoogleGemini => "https://generativelanguage.googleapis.com/v1/models",
    };

    let client = reqwest::Client::new();
    let resp = client.get(test_url)
        .header(&header_name, &header_value)
        .send()
        .await
        .map_err(|e| format!("test request failed: {e}"))?;

    let status = resp.status();
    if status.is_success() {
        Ok(format!("OK ({status})"))
    } else {
        let body = resp.text().await.unwrap_or_default();
        Err(format!("{status}: {body}"))
    }
}
