use crate::singbox::ai_auth_storage::{self, AiAuthSettings, ProviderStatus};
use crate::singbox::ai_auth_ca;
use std::sync::Arc;
use tauri::{AppHandle, Manager};
use crate::singbox::process::SingboxProcess;
use crate::singbox::storage;

#[tauri::command]
pub async fn ai_auth_get_settings() -> Result<AiAuthSettings, String> {
    Ok(ai_auth_storage::load_ai_auth_settings())
}

/// Scan all providers and return their credential status.
#[tauri::command]
pub async fn ai_auth_scan_providers() -> Result<Vec<ProviderStatus>, String> {
    let settings = ai_auth_storage::load_ai_auth_settings();
    Ok(settings.scan_providers())
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
pub async fn ai_auth_test(provider: String) -> Result<String, String> {
    let p = match provider.as_str() {
        "open_ai" => ai_auth_storage::AiProvider::OpenAi,
        "anthropic" => ai_auth_storage::AiProvider::Anthropic,
        "google_gemini" => ai_auth_storage::AiProvider::GoogleGemini,
        _ => return Err(format!("unknown provider: {provider}")),
    };

    let (header_name, header_value) = p
        .auth_header()
        .ok_or("no credential found on this machine")?;

    let test_url = match p {
        ai_auth_storage::AiProvider::OpenAi => "https://api.openai.com/v1/models",
        ai_auth_storage::AiProvider::Anthropic => "https://api.anthropic.com/v1/models",
        ai_auth_storage::AiProvider::GoogleGemini => "https://generativelanguage.googleapis.com/v1/models",
    };

    let client = reqwest::Client::new();
    let resp = client
        .get(test_url)
        .header(&header_name, &header_value)
        .send()
        .await
        .map_err(|e| format!("request failed: {e}"))?;

    let status = resp.status();
    if status.is_success() {
        Ok(format!("OK ({status})"))
    } else {
        let body = resp.text().await.unwrap_or_default();
        Err(format!("{status}: {body}"))
    }
}
