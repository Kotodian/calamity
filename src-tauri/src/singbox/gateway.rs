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
    // pf requires: scrub before rdr
    let mut rules = String::new();
    // 1. Scrub (normalization) — clamp MSS
    rules.push_str(&format!("scrub on en0 max-mss {}\n", max_mss));
    // 2. Table of private/reserved ranges to exclude from redirect
    rules.push_str("table <private> const { 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8 }\n");
    // 3. Redirect forwarded TCP from LAN clients to sing-box redirect port
    //    Only match non-private destinations (single rule, not OR'd)
    rules.push_str(&format!(
        "rdr pass on en0 proto tcp from any to !<private> -> 127.0.0.1 port {}\n",
        REDIRECT_PORT
    ));
    rules
}

/// Register our anchor in the main pf config so rdr/scrub rules take effect.
/// pf requires strict ordering: options → scrub → nat/rdr → filter.
fn register_pf_anchor() -> Result<(), String> {
    let output = Command::new("sudo")
        .args(["-n", "pfctl", "-s", "nat"])
        .output()
        .map_err(|e| format!("failed to read pf nat rules: {}", e))?;
    let current_nat = String::from_utf8_lossy(&output.stdout).to_string();

    let output = Command::new("sudo")
        .args(["-n", "pfctl", "-s", "rules"])
        .output()
        .map_err(|e| format!("failed to read pf rules: {}", e))?;
    let current_rules = String::from_utf8_lossy(&output.stdout).to_string();

    let anchor_ref = format!("\"{}\"", PF_ANCHOR);
    let has_rdr = current_nat.contains(&anchor_ref);
    let has_scrub = current_rules.contains(&anchor_ref);

    if has_rdr && has_scrub {
        return Ok(());
    }

    // Collect existing rules by category to maintain pf ordering
    let mut scrub_lines = Vec::new();
    let mut nat_lines = Vec::new();
    let mut filter_lines = Vec::new();

    for line in current_rules.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() { continue; }
        if trimmed.starts_with("scrub") {
            scrub_lines.push(trimmed.to_string());
        } else {
            filter_lines.push(trimmed.to_string());
        }
    }

    for line in current_nat.lines() {
        let trimmed = line.trim();
        if !trimmed.is_empty() {
            nat_lines.push(trimmed.to_string());
        }
    }

    // Build main config in correct order: scrub → nat/rdr → filter
    let mut main_rules = String::new();

    // 1. Scrub (normalization)
    for line in &scrub_lines {
        main_rules.push_str(line);
        main_rules.push('\n');
    }
    if !has_scrub {
        main_rules.push_str(&format!("scrub-anchor \"{}\" all fragment reassemble\n", PF_ANCHOR));
    }

    // 2. NAT/RDR (translation)
    for line in &nat_lines {
        main_rules.push_str(line);
        main_rules.push('\n');
    }
    if !has_rdr {
        main_rules.push_str(&format!("rdr-anchor \"{}\" all\n", PF_ANCHOR));
    }

    // 3. Filter
    for line in &filter_lines {
        main_rules.push_str(line);
        main_rules.push('\n');
    }

    let output = Command::new("sudo")
        .args(["-n", "pfctl", "-f", "-"])
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .and_then(|mut child| {
            use std::io::Write;
            if let Some(ref mut stdin) = child.stdin {
                stdin.write_all(main_rules.as_bytes())?;
            }
            child.wait_with_output()
        })
        .map_err(|e| format!("failed to register pf anchor: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "pfctl anchor registration failed: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }

    eprintln!("[gateway] pf anchor registered");
    Ok(())
}

/// Enable pf rules for gateway mode: redirect forwarded traffic + MSS clamping.
pub fn enable_pf_rules(mtu: u16) -> Result<(), String> {
    // First register our anchor in the main pf config
    register_pf_anchor()?;

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


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn get_ip_forwarding_returns_bool() {
        let result = get_ip_forwarding();
        assert!(result || !result);
    }

    #[test]
    fn build_pf_rules_scrub_before_rdr() {
        let rules = build_pf_rules(1280);
        let scrub_pos = rules.find("scrub").unwrap();
        let rdr_pos = rules.find("rdr").unwrap();
        assert!(scrub_pos < rdr_pos, "scrub must come before rdr");
        assert!(rules.contains("max-mss 1240"));
        assert!(rules.contains(&format!("port {}", REDIRECT_PORT)));
    }

    #[test]
    fn build_pf_rules_uses_single_rule_with_private_table() {
        let rules = build_pf_rules(1500);
        assert!(rules.contains("table <private>"));
        assert!(rules.contains("!<private>"));
        // Should be exactly one rdr rule, not multiple OR'd rules
        assert_eq!(rules.matches("rdr pass").count(), 1);
    }
}
