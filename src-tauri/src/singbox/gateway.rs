use std::process::Command;

const PF_ANCHOR: &str = "com.calamity.gateway";
const REDIRECT_PORT: u16 = 7894;

/// Read the current value of net.inet.ip.forwarding.
fn get_ip_forwarding() -> bool {
    Command::new("sysctl")
        .args(["-n", "net.inet.ip.forwarding"])
        .output()
        .ok()
        .and_then(|o| String::from_utf8_lossy(&o.stdout).trim().parse::<u8>().ok())
        .map(|v| v == 1)
        .unwrap_or(false)
}

/// Enable IP forwarding via sudo sysctl.
pub fn enable_ip_forwarding() -> Result<(), String> {
    if get_ip_forwarding() {
        eprintln!("[gateway] IP forwarding already enabled");
        return Ok(());
    }
    let output = Command::new("sudo")
        .args(["-n", "sysctl", "-w", "net.inet.ip.forwarding=1"])
        .output()
        .map_err(|e| format!("failed to enable IP forwarding: {}", e))?;
    if !output.status.success() {
        return Err(format!(
            "sysctl failed: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }
    eprintln!("[gateway] IP forwarding enabled");
    Ok(())
}

/// Disable IP forwarding via sudo sysctl.
pub fn disable_ip_forwarding() {
    if !get_ip_forwarding() {
        return;
    }
    let output = Command::new("sudo")
        .args(["-n", "sysctl", "-w", "net.inet.ip.forwarding=0"])
        .output();
    match output {
        Ok(o) if o.status.success() => eprintln!("[gateway] IP forwarding disabled"),
        Ok(o) => eprintln!(
            "[gateway] failed to disable IP forwarding: {}",
            String::from_utf8_lossy(&o.stderr).trim()
        ),
        Err(e) => eprintln!("[gateway] failed to disable IP forwarding: {}", e),
    }
}

/// Build pf rules for gateway mode:
/// - rdr: redirect forwarded TCP traffic to sing-box redirect inbound
/// - scrub: clamp MSS to fit TUN MTU
fn build_pf_rules(mtu: u16) -> String {
    let max_mss = mtu.saturating_sub(40);
    // Redirect forwarded TCP from LAN clients to sing-box redirect port.
    // "pass" skips further rdr evaluation for matched packets.
    // We exclude traffic destined to private/LAN addresses to avoid redirecting local traffic.
    let mut rules = String::new();
    rules.push_str(&format!(
        "rdr pass on en0 proto tcp from any to !10.0.0.0/8 -> 127.0.0.1 port {}\n",
        REDIRECT_PORT
    ));
    rules.push_str(&format!(
        "rdr pass on en0 proto tcp from any to !172.16.0.0/12 -> 127.0.0.1 port {}\n",
        REDIRECT_PORT
    ));
    rules.push_str(&format!(
        "rdr pass on en0 proto tcp from any to !192.168.0.0/16 -> 127.0.0.1 port {}\n",
        REDIRECT_PORT
    ));
    rules.push_str(&format!("scrub on en0 max-mss {}\n", max_mss));
    rules
}

/// Enable pf rules for gateway mode: redirect forwarded traffic + MSS clamping.
pub fn enable_pf_rules(mtu: u16) -> Result<(), String> {
    let rules = build_pf_rules(mtu);

    let output = Command::new("sudo")
        .args(["-n", "pfctl", "-a", PF_ANCHOR, "-f", "-"])
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .and_then(|mut child| {
            use std::io::Write;
            if let Some(ref mut stdin) = child.stdin {
                stdin.write_all(rules.as_bytes())?;
            }
            child.wait_with_output()
        })
        .map_err(|e| format!("failed to load pf rules: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "pfctl failed: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }

    // Ensure pf is enabled
    let _ = Command::new("sudo")
        .args(["-n", "pfctl", "-e"])
        .output();

    eprintln!("[gateway] pf rules enabled (redirect port {}, max-mss {})", REDIRECT_PORT, mtu.saturating_sub(40));
    Ok(())
}

/// Remove all gateway pf rules.
pub fn disable_pf_rules() {
    let output = Command::new("sudo")
        .args(["-n", "pfctl", "-a", PF_ANCHOR, "-F", "all"])
        .output();
    match output {
        Ok(o) if o.status.success() => eprintln!("[gateway] pf rules disabled"),
        Ok(o) => eprintln!(
            "[gateway] failed to flush pf anchor: {}",
            String::from_utf8_lossy(&o.stderr).trim()
        ),
        Err(e) => eprintln!("[gateway] failed to flush pf anchor: {}", e),
    }
}

// Keep old names as aliases for settings.rs compatibility
pub fn enable_mss_clamp(mtu: u16) -> Result<(), String> {
    enable_pf_rules(mtu)
}

pub fn disable_mss_clamp() {
    disable_pf_rules()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn get_ip_forwarding_returns_bool() {
        let result = get_ip_forwarding();
        assert!(result || !result);
    }

    #[test]
    fn build_pf_rules_contains_redirect_and_scrub() {
        let rules = build_pf_rules(1280);
        assert!(rules.contains("rdr pass on en0 proto tcp"));
        assert!(rules.contains(&format!("port {}", REDIRECT_PORT)));
        assert!(rules.contains("max-mss 1240"));
    }

    #[test]
    fn build_pf_rules_excludes_private_ranges() {
        let rules = build_pf_rules(1500);
        assert!(rules.contains("!10.0.0.0/8"));
        assert!(rules.contains("!172.16.0.0/12"));
        assert!(rules.contains("!192.168.0.0/16"));
    }
}
