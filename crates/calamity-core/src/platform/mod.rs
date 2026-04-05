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

/// Get current IP forwarding state.
pub fn get_ip_forwarding() -> bool {
    #[cfg(feature = "macos")]
    { macos::get_ip_forwarding() }
    #[cfg(feature = "linux")]
    { linux::get_ip_forwarding() }
    #[cfg(not(any(feature = "macos", feature = "linux")))]
    { false }
}

/// Enable IP forwarding.
pub fn enable_ip_forwarding() -> Result<(), String> {
    #[cfg(feature = "macos")]
    { macos::enable_ip_forwarding() }
    #[cfg(feature = "linux")]
    { linux::enable_ip_forwarding() }
    #[cfg(not(any(feature = "macos", feature = "linux")))]
    { Err("no platform feature enabled".to_string()) }
}

/// Disable IP forwarding.
pub fn disable_ip_forwarding() {
    #[cfg(feature = "macos")]
    { macos::disable_ip_forwarding() }
    #[cfg(feature = "linux")]
    { linux::disable_ip_forwarding() }
}

/// Detect LAN interface IP.
pub fn detect_lan_ip() -> Option<String> {
    #[cfg(feature = "macos")]
    { macos::detect_en0_ip() }
    #[cfg(feature = "linux")]
    { linux::detect_lan_ip() }
    #[cfg(not(any(feature = "macos", feature = "linux")))]
    { None }
}

/// Detect TUN interface name.
pub fn detect_tun_interface() -> Option<String> {
    #[cfg(feature = "macos")]
    { macos::detect_tun_interface() }
    #[cfg(feature = "linux")]
    { linux::detect_tun_interface() }
    #[cfg(not(any(feature = "macos", feature = "linux")))]
    { None }
}

/// Detect Tailscale interface name.
pub fn detect_tailscale_interface() -> Option<String> {
    #[cfg(feature = "macos")]
    { macos::detect_tailscale_interface() }
    #[cfg(feature = "linux")]
    { linux::detect_tailscale_interface() }
    #[cfg(not(any(feature = "macos", feature = "linux")))]
    { None }
}

/// Get interface IP by name.
pub fn get_interface_ip(iface: &str) -> Option<String> {
    #[cfg(feature = "macos")]
    { macos::get_interface_ip(iface) }
    #[cfg(feature = "linux")]
    { linux::get_interface_ip(iface) }
    #[cfg(not(any(feature = "macos", feature = "linux")))]
    { let _ = iface; None }
}

/// Build redirect rules string (pf on macOS, nftables on Linux).
pub fn build_redirect_rules(
    mtu: u16,
    lan_ip: &str,
    lan_iface: &str,
    tun_iface: &str,
    ts: Option<(&str, &str)>,
) -> String {
    #[cfg(feature = "macos")]
    { macos::build_pf_rules(mtu, lan_ip, tun_iface, ts) }
    #[cfg(feature = "linux")]
    { linux::build_nft_rules(mtu, lan_ip, lan_iface, tun_iface, ts) }
    #[cfg(not(any(feature = "macos", feature = "linux")))]
    { let _ = (mtu, lan_ip, lan_iface, tun_iface, ts); String::new() }
}

/// Enable traffic redirect rules.
pub fn enable_redirect(mtu: u16, tailscale_ip: Option<&str>) -> Result<(), String> {
    #[cfg(feature = "macos")]
    { macos::enable_pf_rules(mtu, tailscale_ip) }
    #[cfg(feature = "linux")]
    { linux::enable_nft_rules(mtu, tailscale_ip) }
    #[cfg(not(any(feature = "macos", feature = "linux")))]
    { let _ = (mtu, tailscale_ip); Err("no platform feature enabled".to_string()) }
}

/// Disable traffic redirect rules.
pub fn disable_redirect() {
    #[cfg(feature = "macos")]
    { macos::disable_pf_rules() }
    #[cfg(feature = "linux")]
    { linux::disable_nft_rules() }
}

/// Prevent system sleep.
pub fn prevent_sleep() {
    #[cfg(feature = "macos")]
    { macos::prevent_sleep() }
    #[cfg(feature = "linux")]
    { linux::prevent_sleep() }
}

/// Allow system sleep.
pub fn allow_sleep() {
    #[cfg(feature = "macos")]
    { macos::allow_sleep() }
    #[cfg(feature = "linux")]
    { linux::allow_sleep() }
}

/// Set system proxy.
pub fn set_system_proxy(http_port: u16, socks_port: u16) {
    #[cfg(feature = "macos")]
    { macos::set_system_proxy(http_port, socks_port) }
    #[cfg(feature = "linux")]
    { linux::set_system_proxy(http_port, socks_port) }
}

/// Clear system proxy.
pub fn clear_system_proxy() {
    #[cfg(feature = "macos")]
    { macos::clear_system_proxy() }
    #[cfg(feature = "linux")]
    { linux::clear_system_proxy() }
}

/// Detect Tailscale IP address (for BGP).
pub fn get_tailscale_ip() -> Option<Ipv4Addr> {
    #[cfg(feature = "macos")]
    { macos::get_tailscale_ip() }
    #[cfg(feature = "linux")]
    { linux::get_tailscale_ip() }
    #[cfg(not(any(feature = "macos", feature = "linux")))]
    { None }
}
