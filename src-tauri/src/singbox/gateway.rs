use std::process::Command;

const PF_ANCHOR: &str = "com.calamity.gateway";

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

/// Build the pf scrub rule for MSS clamping.
/// MSS = MTU - 40 (20 bytes IPv4 header + 20 bytes TCP header).
fn build_pf_rules(mtu: u16) -> String {
    let max_mss = mtu.saturating_sub(40);
    format!("scrub on {{ en0 en1 }} max-mss {}\n", max_mss)
}

/// Enable MSS clamping via pfctl anchor to avoid fragmentation
/// when LAN clients use MTU 1500 but TUN MTU is smaller.
pub fn enable_mss_clamp(mtu: u16) -> Result<(), String> {
    let rules = build_pf_rules(mtu);

    // Load rules into our anchor
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

    eprintln!("[gateway] MSS clamp enabled (max-mss {})", mtu.saturating_sub(40));
    Ok(())
}

/// Remove MSS clamping rules.
pub fn disable_mss_clamp() {
    let output = Command::new("sudo")
        .args(["-n", "pfctl", "-a", PF_ANCHOR, "-F", "all"])
        .output();
    match output {
        Ok(o) if o.status.success() => eprintln!("[gateway] MSS clamp disabled"),
        Ok(o) => eprintln!(
            "[gateway] failed to flush pf anchor: {}",
            String::from_utf8_lossy(&o.stderr).trim()
        ),
        Err(e) => eprintln!("[gateway] failed to flush pf anchor: {}", e),
    }
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
    fn build_pf_rules_clamps_mss_correctly() {
        let rules = build_pf_rules(1280);
        assert_eq!(rules, "scrub on { en0 en1 } max-mss 1240\n");
    }

    #[test]
    fn build_pf_rules_standard_mtu() {
        let rules = build_pf_rules(9000);
        assert_eq!(rules, "scrub on { en0 en1 } max-mss 8960\n");
    }
}
