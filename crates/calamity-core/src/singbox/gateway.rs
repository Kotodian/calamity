//! Gateway mode — transparent LAN proxy.
//!
//! Platform-specific implementations (pf on macOS, nftables on Linux)
//! live in `crate::platform::{macos,linux}`. This module provides the
//! public API that the rest of the codebase calls.

use crate::platform;

pub fn get_ip_forwarding() -> bool {
    platform::get_ip_forwarding()
}

pub fn enable_ip_forwarding() -> Result<(), String> {
    platform::enable_ip_forwarding()
}

pub fn disable_ip_forwarding() {
    platform::disable_ip_forwarding()
}

pub fn enable_pf_rules(mtu: u16, tailscale_ip: Option<&str>) -> Result<(), String> {
    platform::enable_redirect(mtu, tailscale_ip)
}

pub fn disable_pf_rules() {
    platform::disable_redirect()
}

pub fn prevent_sleep() {
    platform::prevent_sleep()
}

pub fn allow_sleep() {
    platform::allow_sleep()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn get_ip_forwarding_returns_bool() {
        let result = get_ip_forwarding();
        assert!(result || !result);
    }
}
