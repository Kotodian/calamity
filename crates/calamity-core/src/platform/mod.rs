#[cfg(feature = "macos")]
pub mod macos;
#[cfg(feature = "linux")]
pub mod linux;

use std::net::Ipv4Addr;

/// Network interface info detected at runtime.
pub struct InterfaceInfo {
    pub lan_ip: String,
    pub lan_iface: String,
    pub tun_iface: String,
    pub tailscale: Option<TailscaleIface>,
}

pub struct TailscaleIface {
    pub iface: String,
    pub ip: String,
}

// --- Platform-dispatched functions ---
// Use target_os (not feature) for dispatch so both features can coexist
// in a unified workspace build.

pub fn get_ip_forwarding() -> bool {
    #[cfg(target_os = "macos")]
    { macos::get_ip_forwarding() }
    #[cfg(target_os = "linux")]
    { linux::get_ip_forwarding() }
    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    { false }
}

pub fn enable_ip_forwarding() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    { macos::enable_ip_forwarding() }
    #[cfg(target_os = "linux")]
    { linux::enable_ip_forwarding() }
    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    { Err("unsupported platform".to_string()) }
}

pub fn disable_ip_forwarding() {
    #[cfg(target_os = "macos")]
    { macos::disable_ip_forwarding() }
    #[cfg(target_os = "linux")]
    { linux::disable_ip_forwarding() }
}

pub fn detect_lan_ip() -> Option<String> {
    #[cfg(target_os = "macos")]
    { macos::detect_en0_ip() }
    #[cfg(target_os = "linux")]
    { linux::detect_lan_ip() }
    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    { None }
}

pub fn detect_tun_interface() -> Option<String> {
    #[cfg(target_os = "macos")]
    { macos::detect_tun_interface() }
    #[cfg(target_os = "linux")]
    { linux::detect_tun_interface() }
    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    { None }
}

pub fn detect_tailscale_interface() -> Option<String> {
    #[cfg(target_os = "macos")]
    { macos::detect_tailscale_interface() }
    #[cfg(target_os = "linux")]
    { linux::detect_tailscale_interface() }
    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    { None }
}

pub fn get_interface_ip(iface: &str) -> Option<String> {
    #[cfg(target_os = "macos")]
    { macos::get_interface_ip(iface) }
    #[cfg(target_os = "linux")]
    { linux::get_interface_ip(iface) }
    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    { let _ = iface; None }
}

pub fn build_redirect_rules(
    mtu: u16,
    lan_ip: &str,
    lan_iface: &str,
    tun_iface: &str,
    ts: Option<(&str, &str)>,
) -> String {
    #[cfg(target_os = "macos")]
    { let _ = lan_iface; macos::build_pf_rules(mtu, lan_ip, tun_iface, ts) }
    #[cfg(target_os = "linux")]
    { linux::build_nft_rules(mtu, lan_ip, lan_iface, tun_iface, ts) }
    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    { let _ = (mtu, lan_ip, lan_iface, tun_iface, ts); String::new() }
}

pub fn enable_redirect(mtu: u16, tailscale_ip: Option<&str>) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    { macos::enable_pf_rules(mtu, tailscale_ip) }
    #[cfg(target_os = "linux")]
    { linux::enable_nft_rules(mtu, tailscale_ip) }
    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    { let _ = (mtu, tailscale_ip); Err("unsupported platform".to_string()) }
}

pub fn disable_redirect() {
    #[cfg(target_os = "macos")]
    { macos::disable_pf_rules() }
    #[cfg(target_os = "linux")]
    { linux::disable_nft_rules() }
}

pub fn prevent_sleep() {
    #[cfg(target_os = "macos")]
    { macos::prevent_sleep() }
    #[cfg(target_os = "linux")]
    { linux::prevent_sleep() }
}

pub fn allow_sleep() {
    #[cfg(target_os = "macos")]
    { macos::allow_sleep() }
    #[cfg(target_os = "linux")]
    { linux::allow_sleep() }
}

pub fn set_system_proxy(http_port: u16, socks_port: u16) {
    #[cfg(target_os = "macos")]
    { macos::set_system_proxy(http_port, socks_port) }
    #[cfg(target_os = "linux")]
    { linux::set_system_proxy(http_port, socks_port) }
    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    { let _ = (http_port, socks_port); }
}

pub fn clear_system_proxy() {
    #[cfg(target_os = "macos")]
    { macos::clear_system_proxy() }
    #[cfg(target_os = "linux")]
    { linux::clear_system_proxy() }
}

pub fn get_tailscale_ip() -> Option<Ipv4Addr> {
    #[cfg(target_os = "macos")]
    { macos::get_tailscale_ip() }
    #[cfg(target_os = "linux")]
    { linux::get_tailscale_ip() }
    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    { None }
}
