pub mod network;
pub mod system_proxy;
pub mod gateway;

// Re-export for convenience
pub use network::get_tailscale_ip;
pub use system_proxy::{set_system_proxy, clear_system_proxy};
pub use gateway::{
    get_ip_forwarding, enable_ip_forwarding, disable_ip_forwarding,
    enable_redirect, disable_redirect,
    prevent_sleep, allow_sleep,
};
pub use network::{detect_lan_ip, detect_tun_interface, detect_tailscale_interface, get_interface_ip};

/// Get the gateway's LAN IP address (alias for detect_lan_ip).
pub fn get_lan_ip() -> Option<String> {
    detect_lan_ip()
}
