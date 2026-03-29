use crate::singbox::tailscale_cli;

#[tauri::command]
pub async fn tailscale_status() -> Result<tailscale_cli::TailscaleStatus, String> {
    tailscale_cli::get_status()
}

#[tauri::command]
pub async fn tailscale_login() -> Result<String, String> {
    tailscale_cli::login()
}

#[tauri::command]
pub async fn tailscale_logout() -> Result<(), String> {
    tailscale_cli::logout()
}

#[tauri::command]
pub async fn tailscale_set_exit_node(ip: String) -> Result<(), String> {
    tailscale_cli::set_exit_node(&ip)
}

#[tauri::command]
pub async fn tailscale_get_serve_status() -> Result<Vec<tailscale_cli::FunnelEntry>, String> {
    tailscale_cli::get_serve_status()
}

#[tauri::command]
pub async fn tailscale_add_funnel(port: u16, allow_public: bool) -> Result<(), String> {
    tailscale_cli::add_funnel(port, allow_public)
}

#[tauri::command]
pub async fn tailscale_remove_funnel(port: u16) -> Result<(), String> {
    tailscale_cli::remove_funnel(port)
}
