//! Network interface detection — cross-platform via if-addrs + platform commands.

use std::net::Ipv4Addr;
use std::process::Command;

/// Detect Tailscale IP (100.64-127.x.x.x CGNAT range) from system interfaces.
pub fn get_tailscale_ip() -> Option<Ipv4Addr> {
    for iface in if_addrs::get_if_addrs().ok()? {
        if let std::net::IpAddr::V4(ip) = iface.ip() {
            let octets = ip.octets();
            if octets[0] == 100 && (64..=127).contains(&octets[1]) {
                return Some(ip);
            }
        }
    }
    None
}

/// Detect the primary LAN interface IP.
pub fn detect_lan_ip() -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        let output = Command::new("ifconfig").arg("en0").output().ok()?;
        let text = String::from_utf8_lossy(&output.stdout);
        for line in text.lines() {
            let trimmed = line.trim();
            if trimmed.starts_with("inet ") {
                return trimmed.split_whitespace().nth(1).map(|s| s.to_string());
            }
        }
        None
    }
    #[cfg(target_os = "linux")]
    {
        let output = Command::new("ip")
            .args(["-4", "-o", "addr", "show", "scope", "global"])
            .output()
            .ok()?;
        let text = String::from_utf8_lossy(&output.stdout);
        for line in text.lines() {
            if line.contains("tailscale") {
                continue;
            }
            if let Some(ip) = parse_ip_addr_line(line) {
                return Some(ip);
            }
        }
        None
    }
}

/// Detect TUN interface name.
pub fn detect_tun_interface() -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        let output = Command::new("netstat")
            .args(["-rn", "-f", "inet"])
            .output()
            .ok()?;
        let text = String::from_utf8_lossy(&output.stdout);
        for line in text.lines() {
            if line.contains("172.19.0.1") {
                return line.split_whitespace().last().map(|s| s.to_string());
            }
        }
        None
    }
    #[cfg(target_os = "linux")]
    {
        let output = Command::new("ip")
            .args(["route", "show", "172.19.0.0/30"])
            .output()
            .ok()?;
        let text = String::from_utf8_lossy(&output.stdout);
        for line in text.lines() {
            if let Some(dev_pos) = line.find("dev ") {
                let rest = &line[dev_pos + 4..];
                return rest.split_whitespace().next().map(|s| s.to_string());
            }
        }
        None
    }
}

/// Detect Tailscale interface name.
pub fn detect_tailscale_interface() -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        let output = Command::new("netstat")
            .args(["-rn", "-f", "inet"])
            .output()
            .ok()?;
        let text = String::from_utf8_lossy(&output.stdout);
        for line in text.lines() {
            if line.contains("100.64/10") {
                return line.split_whitespace().last().map(|s| s.to_string());
            }
        }
        None
    }
    #[cfg(target_os = "linux")]
    {
        let output = Command::new("ip")
            .args(["route", "show", "100.64.0.0/10"])
            .output()
            .ok()?;
        let text = String::from_utf8_lossy(&output.stdout);
        for line in text.lines() {
            if let Some(dev_pos) = line.find("dev ") {
                let rest = &line[dev_pos + 4..];
                return rest.split_whitespace().next().map(|s| s.to_string());
            }
        }
        None
    }
}

/// Get interface IP by name.
pub fn get_interface_ip(iface: &str) -> Option<String> {
    // Cross-platform via if-addrs
    for if_addr in if_addrs::get_if_addrs().ok()? {
        if if_addr.name == iface {
            if let std::net::IpAddr::V4(ip) = if_addr.ip() {
                if !ip.is_loopback() {
                    return Some(ip.to_string());
                }
            }
        }
    }
    None
}

/// Detect the primary LAN interface name (Linux only).
#[cfg(target_os = "linux")]
pub fn detect_lan_interface() -> Option<String> {
    let output = Command::new("ip")
        .args(["-4", "-o", "addr", "show", "scope", "global"])
        .output()
        .ok()?;
    let text = String::from_utf8_lossy(&output.stdout);
    for line in text.lines() {
        if line.contains("tailscale") {
            continue;
        }
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 2 {
            return Some(parts[1].trim_end_matches(':').to_string());
        }
    }
    None
}

/// Parse an `ip -o addr` line to extract IPv4 address (Linux).
#[cfg(target_os = "linux")]
pub fn parse_ip_addr_line(line: &str) -> Option<String> {
    let inet_pos = line.find("inet ")?;
    let rest = &line[inet_pos + 5..];
    let cidr = rest.split_whitespace().next()?;
    Some(cidr.split('/').next()?.to_string())
}

#[cfg(test)]
mod tests {
    #[cfg(target_os = "linux")]
    use super::*;

    #[cfg(target_os = "linux")]
    #[test]
    fn parse_ip_addr_line_extracts_ip() {
        let line = "2: eth0    inet 192.168.1.100/24 brd 192.168.1.255 scope global eth0";
        assert_eq!(parse_ip_addr_line(line), Some("192.168.1.100".to_string()));
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn parse_ip_addr_line_returns_none_for_no_inet() {
        let line = "1: lo    <LOOPBACK,UP,LOWER_UP>";
        assert_eq!(parse_ip_addr_line(line), None);
    }
}
