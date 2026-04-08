//! Gateway mode — IP forwarding, traffic redirect (pf/nftables), sleep prevention.

use std::process::Command;
use std::sync::Mutex;

static SLEEP_CHILD: Mutex<Option<std::process::Child>> = Mutex::new(None);

// --- IP Forwarding ---

const SYSCTL_KEY: &str = if cfg!(target_os = "macos") {
    "net.inet.ip.forwarding"
} else {
    "net.ipv4.ip_forward"
};

pub fn get_ip_forwarding() -> bool {
    Command::new("sysctl")
        .args(["-n", SYSCTL_KEY])
        .output()
        .ok()
        .and_then(|o| String::from_utf8_lossy(&o.stdout).trim().parse::<u8>().ok())
        .map(|v| v == 1)
        .unwrap_or(false)
}

pub fn enable_ip_forwarding() -> Result<(), String> {
    if get_ip_forwarding() {
        log::info!("IP forwarding already enabled");
        return Ok(());
    }
    let set_arg = format!("{}=1", SYSCTL_KEY);
    #[cfg(target_os = "macos")]
    let output = Command::new("sudo").args(["-n", "sysctl", "-w", &set_arg]).output();
    #[cfg(target_os = "linux")]
    let output = Command::new("sysctl").args(["-w", &set_arg]).output();

    let output = output.map_err(|e| format!("failed to enable IP forwarding: {}", e))?;
    if !output.status.success() {
        return Err(format!("sysctl failed: {}", String::from_utf8_lossy(&output.stderr).trim()));
    }
    log::info!("IP forwarding enabled");
    Ok(())
}

pub fn disable_ip_forwarding() {
    if !get_ip_forwarding() {
        return;
    }
    let set_arg = format!("{}=0", SYSCTL_KEY);
    #[cfg(target_os = "macos")]
    let output = Command::new("sudo").args(["-n", "sysctl", "-w", &set_arg]).output();
    #[cfg(target_os = "linux")]
    let output = Command::new("sysctl").args(["-w", &set_arg]).output();

    match output {
        Ok(o) if o.status.success() => log::info!("IP forwarding disabled"),
        Ok(o) => log::error!("failed to disable IP forwarding: {}", String::from_utf8_lossy(&o.stderr).trim()),
        Err(e) => log::error!("failed to disable IP forwarding: {}", e),
    }
}

// --- Traffic Redirect ---

pub fn enable_redirect(mtu: u16, tailscale_ip: Option<&str>) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    { enable_pf_rules(mtu, tailscale_ip) }
    #[cfg(target_os = "linux")]
    { enable_nft_rules(mtu, tailscale_ip) }
}

pub fn disable_redirect() {
    #[cfg(target_os = "macos")]
    { disable_pf_rules() }
    #[cfg(target_os = "linux")]
    { disable_nft_rules() }
}

// --- Sleep Prevention ---

pub fn prevent_sleep() {
    let mut guard = SLEEP_CHILD.lock().unwrap();
    if guard.is_some() {
        return;
    }

    #[cfg(target_os = "macos")]
    {
        let _ = Command::new("sudo").args(["-n", "pmset", "-a", "disablesleep", "1"]).output();
        match Command::new("caffeinate").args(["-dims"]).spawn() {
            Ok(child) => {
                log::info!("sleep prevention enabled (pid={})", child.id());
                *guard = Some(child);
            }
            Err(e) => log::error!("failed to start caffeinate: {}", e),
        }
    }
    #[cfg(target_os = "linux")]
    {
        match Command::new("systemd-inhibit")
            .args(["--what=sleep:idle", "--who=calamity", "--why=Gateway mode active", "--mode=block", "sleep", "infinity"])
            .spawn()
        {
            Ok(child) => {
                log::info!("sleep prevention enabled (pid={})", child.id());
                *guard = Some(child);
            }
            Err(e) => log::error!("failed to start systemd-inhibit: {}", e),
        }
    }
}

pub fn allow_sleep() {
    let mut guard = SLEEP_CHILD.lock().unwrap();
    if let Some(ref mut child) = *guard {
        let _ = child.kill();
        let _ = child.wait();
        log::info!("sleep prevention disabled");
    }
    *guard = None;

    #[cfg(target_os = "macos")]
    {
        let _ = Command::new("sudo").args(["-n", "pmset", "-a", "disablesleep", "0"]).output();
    }
}

// ── macOS: pf rules ─────────────────────────────────────

#[cfg(target_os = "macos")]
const PF_ANCHOR: &str = "com.calamity.gateway";

#[cfg(target_os = "macos")]
pub fn build_pf_rules(mtu: u16, mac_ip: &str, tun_iface: &str, ts: Option<(&str, &str)>) -> String {
    let max_mss = mtu.saturating_sub(40);
    let mut rules = String::new();
    rules.push_str(&format!("scrub on en0 max-mss {}\n", max_mss));
    rules.push_str("table <private> const { 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8 }\n");
    if let Some((ts_iface, ts_ip)) = ts {
        rules.push_str(&format!("nat on {} from en0:network to 100.64.0.0/10 -> {}\n", ts_iface, ts_ip));
    }
    rules.push_str(&format!("pass in quick on en0 route-to ({} 172.19.0.1) from !{} to !<private>\n", tun_iface, mac_ip));
    rules
}

#[cfg(target_os = "macos")]
fn enable_pf_rules(mtu: u16, tailscale_ip: Option<&str>) -> Result<(), String> {
    register_pf_anchor()?;
    let mac_ip = super::network::detect_lan_ip().ok_or("failed to detect en0 IP")?;
    let tun_iface = super::network::detect_tun_interface().ok_or("failed to detect TUN interface")?;
    let ts = super::network::detect_tailscale_interface().and_then(|iface| {
        let ip = tailscale_ip.map(|s| s.to_string()).or_else(|| super::network::get_interface_ip(&iface))?;
        Some((iface, ip))
    });
    let rules = build_pf_rules(mtu, &mac_ip, &tun_iface, ts.as_ref().map(|(i, ip)| (i.as_str(), ip.as_str())));
    let output = Command::new("sudo")
        .args(["-n", "pfctl", "-a", PF_ANCHOR, "-f", "-"])
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .and_then(|mut child| {
            use std::io::Write;
            if let Some(ref mut stdin) = child.stdin { stdin.write_all(rules.as_bytes())?; }
            child.wait_with_output()
        })
        .map_err(|e| format!("failed to load pf rules: {}", e))?;
    if !output.status.success() {
        return Err(format!("pfctl failed: {}", String::from_utf8_lossy(&output.stderr).trim()));
    }
    let _ = Command::new("sudo").args(["-n", "pfctl", "-e"]).output();
    log::info!("pf rules enabled (tun={}, mac={}, ts={}, max-mss={})", tun_iface, mac_ip,
        ts.as_ref().map(|(i, ip)| format!("{}:{}", i, ip)).unwrap_or_else(|| "none".to_string()), mtu.saturating_sub(40));
    Ok(())
}

#[cfg(target_os = "macos")]
fn register_pf_anchor() -> Result<(), String> {
    let output = Command::new("sudo").args(["-n", "pfctl", "-s", "nat"]).output()
        .map_err(|e| format!("failed to read pf nat rules: {}", e))?;
    let current_nat = String::from_utf8_lossy(&output.stdout).to_string();
    let output = Command::new("sudo").args(["-n", "pfctl", "-s", "rules"]).output()
        .map_err(|e| format!("failed to read pf rules: {}", e))?;
    let current_rules = String::from_utf8_lossy(&output.stdout).to_string();

    let anchor_ref = format!("\"{}\"", PF_ANCHOR);
    let has_nat = current_nat.contains(&format!("nat-anchor {}", anchor_ref));
    let has_scrub = current_rules.contains(&anchor_ref);
    let has_anchor = current_rules.lines().any(|l| l.trim().starts_with("anchor") && l.contains(&anchor_ref));
    if has_nat && has_scrub && has_anchor { return Ok(()); }

    let mut scrub_lines = Vec::new();
    let mut nat_lines = Vec::new();
    let mut filter_lines = Vec::new();
    for line in current_rules.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() { continue; }
        if trimmed.starts_with("scrub") { scrub_lines.push(trimmed.to_string()); }
        else { filter_lines.push(trimmed.to_string()); }
    }
    for line in current_nat.lines() {
        let trimmed = line.trim();
        if !trimmed.is_empty() { nat_lines.push(trimmed.to_string()); }
    }
    let mut main_rules = String::new();
    for line in &scrub_lines { main_rules.push_str(line); main_rules.push('\n'); }
    if !has_scrub { main_rules.push_str(&format!("scrub-anchor \"{}\" all fragment reassemble\n", PF_ANCHOR)); }
    if !has_nat { main_rules.push_str(&format!("nat-anchor \"{}\" all\n", PF_ANCHOR)); }
    for line in &nat_lines { main_rules.push_str(line); main_rules.push('\n'); }
    for line in &filter_lines { main_rules.push_str(line); main_rules.push('\n'); }
    if !has_anchor { main_rules.push_str(&format!("anchor \"{}\" all\n", PF_ANCHOR)); }

    let output = Command::new("sudo").args(["-n", "pfctl", "-f", "-"])
        .stdin(std::process::Stdio::piped()).stdout(std::process::Stdio::piped()).stderr(std::process::Stdio::piped())
        .spawn()
        .and_then(|mut child| {
            use std::io::Write;
            if let Some(ref mut stdin) = child.stdin { stdin.write_all(main_rules.as_bytes())?; }
            child.wait_with_output()
        })
        .map_err(|e| format!("failed to register pf anchor: {}", e))?;
    if !output.status.success() {
        return Err(format!("pfctl anchor registration failed: {}", String::from_utf8_lossy(&output.stderr).trim()));
    }
    log::info!("pf anchor registered");
    Ok(())
}

#[cfg(target_os = "macos")]
fn disable_pf_rules() {
    let output = Command::new("sudo").args(["-n", "pfctl", "-a", PF_ANCHOR, "-F", "all"]).output();
    match output {
        Ok(o) if o.status.success() => log::info!("pf rules disabled"),
        Ok(o) => log::error!("failed to flush pf anchor: {}", String::from_utf8_lossy(&o.stderr).trim()),
        Err(e) => log::error!("failed to flush pf anchor: {}", e),
    }
}

// ── Linux: nftables rules ───────────────────────────────

#[cfg(target_os = "linux")]
const NFT_TABLE: &str = "calamity";

#[cfg(target_os = "linux")]
pub fn build_nft_rules(mtu: u16, lan_ip: &str, lan_iface: &str, tun_iface: &str, ts: Option<(&str, &str)>) -> String {
    let max_mss = mtu.saturating_sub(40);
    let mut rules = String::new();
    rules.push_str(&format!("table ip {} {{\n", NFT_TABLE));
    rules.push_str("  chain postrouting {\n");
    rules.push_str("    type nat hook postrouting priority srcnat; policy accept;\n");
    if let Some((ts_iface, ts_ip)) = ts {
        rules.push_str(&format!("    iifname \"{}\" oifname \"{}\" ip daddr 100.64.0.0/10 snat to {}\n", lan_iface, ts_iface, ts_ip));
    }
    rules.push_str(&format!("    iifname \"{}\" oifname \"{}\" masquerade\n", lan_iface, tun_iface));
    rules.push_str("  }\n\n");
    rules.push_str("  chain forward {\n");
    rules.push_str("    type filter hook forward priority filter; policy accept;\n");
    rules.push_str(&format!("    iifname \"{}\" tcp flags syn tcp option maxseg size set {}\n", lan_iface, max_mss));
    rules.push_str("  }\n\n");
    rules.push_str("  chain prerouting {\n");
    rules.push_str("    type filter hook prerouting priority mangle; policy accept;\n");
    rules.push_str(&format!("    iifname \"{}\" ip saddr != {} ip daddr != {{ 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8 }} mark set 0x1\n", lan_iface, lan_ip));
    rules.push_str("  }\n");
    rules.push_str("}\n");
    rules
}

#[cfg(target_os = "linux")]
fn enable_nft_rules(mtu: u16, tailscale_ip: Option<&str>) -> Result<(), String> {
    let lan_ip = super::network::detect_lan_ip().ok_or("failed to detect LAN IP")?;
    let lan_iface = super::network::detect_lan_interface().ok_or("failed to detect LAN interface")?;
    let tun_iface = super::network::detect_tun_interface().ok_or("failed to detect TUN interface")?;
    let ts = super::network::detect_tailscale_interface().and_then(|iface| {
        let ip = tailscale_ip.map(|s| s.to_string()).or_else(|| super::network::get_interface_ip(&iface))?;
        Some((iface, ip))
    });
    let rules = build_nft_rules(mtu, &lan_ip, &lan_iface, &tun_iface, ts.as_ref().map(|(i, ip)| (i.as_str(), ip.as_str())));
    let _ = Command::new("nft").args(["delete", "table", "ip", NFT_TABLE]).output();
    let output = Command::new("nft").arg("-f").arg("-")
        .stdin(std::process::Stdio::piped()).stdout(std::process::Stdio::piped()).stderr(std::process::Stdio::piped())
        .spawn()
        .and_then(|mut child| {
            use std::io::Write;
            if let Some(ref mut stdin) = child.stdin { stdin.write_all(rules.as_bytes())?; }
            child.wait_with_output()
        })
        .map_err(|e| format!("failed to load nft rules: {}", e))?;
    if !output.status.success() {
        return Err(format!("nft failed: {}", String::from_utf8_lossy(&output.stderr).trim()));
    }
    let _ = Command::new("ip").args(["rule", "add", "fwmark", "1", "table", "100"]).output();
    let _ = Command::new("ip").args(["route", "add", "default", "dev", &tun_iface, "table", "100"]).output();
    log::info!("nft rules enabled (tun={}, lan={}:{}, ts={}, max-mss={})", tun_iface, lan_iface, lan_ip,
        ts.as_ref().map(|(i, ip)| format!("{}:{}", i, ip)).unwrap_or_else(|| "none".to_string()), mtu.saturating_sub(40));
    Ok(())
}

#[cfg(target_os = "linux")]
fn disable_nft_rules() {
    let output = Command::new("nft").args(["delete", "table", "ip", NFT_TABLE]).output();
    match output {
        Ok(o) if o.status.success() => log::info!("nft rules disabled"),
        Ok(o) => log::error!("failed to delete nft table: {}", String::from_utf8_lossy(&o.stderr).trim()),
        Err(e) => log::error!("failed to delete nft table: {}", e),
    }
    let _ = Command::new("ip").args(["rule", "del", "fwmark", "1", "table", "100"]).output();
    let _ = Command::new("ip").args(["route", "del", "default", "table", "100"]).output();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn get_ip_forwarding_returns_bool() {
        let result = get_ip_forwarding();
        assert!(result || !result);
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn build_pf_rules_with_tailscale() {
        let rules = build_pf_rules(1280, "192.168.31.159", "utun9", Some(("utun10", "100.93.14.146")));
        assert!(rules.contains("max-mss 1240"));
        assert!(rules.contains("nat on utun10"));
        assert!(rules.contains("route-to (utun9 172.19.0.1)"));
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn build_pf_rules_without_tailscale() {
        let rules = build_pf_rules(1500, "192.168.1.1", "utun5", None);
        assert!(!rules.contains("nat on"));
        assert!(rules.contains("max-mss 1460"));
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn build_nft_rules_with_tailscale() {
        let rules = build_nft_rules(1280, "192.168.1.100", "eth0", "tun0", Some(("tailscale0", "100.93.14.146")));
        assert!(rules.contains("table ip calamity"));
        assert!(rules.contains("snat to 100.93.14.146"));
        assert!(rules.contains("masquerade"));
        assert!(rules.contains("tcp option maxseg size set 1240"));
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn build_nft_rules_without_tailscale() {
        let rules = build_nft_rules(1500, "192.168.1.1", "eth0", "tun0", None);
        assert!(!rules.contains("snat"));
        assert!(rules.contains("masquerade"));
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn build_nft_rules_chain_order() {
        let rules = build_nft_rules(1500, "10.0.0.1", "br0", "tun0", None);
        let post_pos = rules.find("chain postrouting").unwrap();
        let fwd_pos = rules.find("chain forward").unwrap();
        let pre_pos = rules.find("chain prerouting").unwrap();
        assert!(post_pos < fwd_pos);
        assert!(fwd_pos < pre_pos);
    }
}
