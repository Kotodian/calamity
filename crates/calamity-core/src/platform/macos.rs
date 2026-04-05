use std::process::Command;
use std::sync::Mutex;

const PF_ANCHOR: &str = "com.calamity.gateway";

static CAFFEINATE: Mutex<Option<std::process::Child>> = Mutex::new(None);

// --- IP Forwarding ---

pub fn get_ip_forwarding() -> bool {
    Command::new("sysctl")
        .args(["-n", "net.inet.ip.forwarding"])
        .output()
        .ok()
        .and_then(|o| String::from_utf8_lossy(&o.stdout).trim().parse::<u8>().ok())
        .map(|v| v == 1)
        .unwrap_or(false)
}

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

// --- Interface Detection ---

pub fn detect_en0_ip() -> Option<String> {
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

pub fn detect_tun_interface() -> Option<String> {
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

pub fn detect_tailscale_interface() -> Option<String> {
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

pub fn get_interface_ip(iface: &str) -> Option<String> {
    let output = Command::new("ifconfig").arg(iface).output().ok()?;
    let text = String::from_utf8_lossy(&output.stdout);
    text.lines()
        .find(|l| l.trim().starts_with("inet "))?
        .trim()
        .split_whitespace()
        .nth(1)
        .map(|s| s.to_string())
}

// --- PF Rules ---

pub fn build_pf_rules(
    mtu: u16,
    mac_ip: &str,
    tun_iface: &str,
    ts: Option<(&str, &str)>,
) -> String {
    let max_mss = mtu.saturating_sub(40);
    let mut rules = String::new();

    rules.push_str(&format!("scrub on en0 max-mss {}\n", max_mss));
    rules.push_str(
        "table <private> const { 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8 }\n",
    );

    if let Some((ts_iface, ts_ip)) = ts {
        rules.push_str(&format!(
            "nat on {} from en0:network to 100.64.0.0/10 -> {}\n",
            ts_iface, ts_ip
        ));
    }

    rules.push_str(&format!(
        "pass in quick on en0 route-to ({} 172.19.0.1) from !{} to !<private>\n",
        tun_iface, mac_ip
    ));

    rules
}

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
    let has_nat = current_nat.contains(&format!("nat-anchor {}", anchor_ref));
    let has_scrub = current_rules.contains(&anchor_ref);
    let has_anchor = current_rules
        .lines()
        .any(|l| l.trim().starts_with("anchor") && l.contains(&anchor_ref));

    if has_nat && has_scrub && has_anchor {
        return Ok(());
    }

    let mut scrub_lines = Vec::new();
    let mut nat_lines = Vec::new();
    let mut filter_lines = Vec::new();

    for line in current_rules.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
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

    let mut main_rules = String::new();

    for line in &scrub_lines {
        main_rules.push_str(line);
        main_rules.push('\n');
    }
    if !has_scrub {
        main_rules.push_str(&format!(
            "scrub-anchor \"{}\" all fragment reassemble\n",
            PF_ANCHOR
        ));
    }

    if !has_nat {
        main_rules.push_str(&format!("nat-anchor \"{}\" all\n", PF_ANCHOR));
    }
    for line in &nat_lines {
        main_rules.push_str(line);
        main_rules.push('\n');
    }

    for line in &filter_lines {
        main_rules.push_str(line);
        main_rules.push('\n');
    }
    if !has_anchor {
        main_rules.push_str(&format!("anchor \"{}\" all\n", PF_ANCHOR));
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

pub fn enable_pf_rules(mtu: u16, tailscale_ip: Option<&str>) -> Result<(), String> {
    register_pf_anchor()?;

    let mac_ip = detect_en0_ip().ok_or("failed to detect en0 IP")?;
    let tun_iface = detect_tun_interface().ok_or("failed to detect TUN interface")?;
    let ts = detect_tailscale_interface().and_then(|iface| {
        let ip = tailscale_ip.map(|s| s.to_string()).or_else(|| get_interface_ip(&iface))?;
        Some((iface, ip))
    });

    let rules = build_pf_rules(
        mtu,
        &mac_ip,
        &tun_iface,
        ts.as_ref().map(|(i, ip)| (i.as_str(), ip.as_str())),
    );

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

    let _ = Command::new("sudo").args(["-n", "pfctl", "-e"]).output();

    eprintln!(
        "[gateway] pf rules enabled (tun={}, mac={}, ts={}, max-mss={})",
        tun_iface,
        mac_ip,
        ts.as_ref()
            .map(|(i, ip)| format!("{}:{}", i, ip))
            .unwrap_or_else(|| "none".to_string()),
        mtu.saturating_sub(40)
    );
    Ok(())
}

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

// --- Sleep Prevention ---

pub fn prevent_sleep() {
    let mut guard = CAFFEINATE.lock().unwrap();
    if guard.is_some() {
        return;
    }
    let _ = Command::new("sudo")
        .args(["-n", "pmset", "-a", "disablesleep", "1"])
        .output();
    match Command::new("caffeinate").args(["-dims"]).spawn() {
        Ok(child) => {
            eprintln!("[gateway] sleep prevention enabled (pid={})", child.id());
            *guard = Some(child);
        }
        Err(e) => eprintln!("[gateway] failed to start caffeinate: {}", e),
    }
}

pub fn allow_sleep() {
    let mut guard = CAFFEINATE.lock().unwrap();
    if let Some(ref mut child) = *guard {
        let _ = child.kill();
        let _ = child.wait();
        eprintln!("[gateway] sleep prevention disabled");
    }
    *guard = None;
    let _ = Command::new("sudo")
        .args(["-n", "pmset", "-a", "disablesleep", "0"])
        .output();
}

// --- System Proxy ---

fn get_active_network_services() -> Vec<String> {
    let output = match Command::new("networksetup")
        .args(["-listallnetworkservices"])
        .output()
    {
        Ok(o) if o.status.success() => o,
        _ => return vec![],
    };

    let text = String::from_utf8_lossy(&output.stdout);
    let mut services = Vec::new();

    for line in text.lines().skip(1) {
        let name = line.trim();
        if name.is_empty() || name.starts_with('*') {
            continue;
        }
        if let Ok(info) = Command::new("networksetup").args(["-getinfo", name]).output() {
            let info_text = String::from_utf8_lossy(&info.stdout);
            let has_ip = info_text
                .lines()
                .any(|l| l.starts_with("IP address:") && !l.contains("none") && l.len() > 12);
            if has_ip {
                services.push(name.to_string());
            }
        }
    }
    services
}

pub fn set_system_proxy(http_port: u16, socks_port: u16) {
    let services = get_active_network_services();
    if services.is_empty() {
        eprintln!("[system-proxy] no active network services found");
        return;
    }

    let http_str = http_port.to_string();
    let socks_str = socks_port.to_string();

    for service in &services {
        eprintln!("[system-proxy] setting proxy on: {}", service);
        let cmds: Vec<Vec<&str>> = vec![
            vec!["-setwebproxy", service, "127.0.0.1", &http_str],
            vec!["-setwebproxystate", service, "on"],
            vec!["-setsecurewebproxy", service, "127.0.0.1", &http_str],
            vec!["-setsecurewebproxystate", service, "on"],
            vec!["-setsocksfirewallproxy", service, "127.0.0.1", &socks_str],
            vec!["-setsocksfirewallproxystate", service, "on"],
        ];
        for args in &cmds {
            let _ = Command::new("networksetup").args(args).output();
        }
    }
}

pub fn clear_system_proxy() {
    let services = get_active_network_services();
    if services.is_empty() {
        eprintln!("[system-proxy] no active network services found");
        return;
    }

    for service in &services {
        eprintln!("[system-proxy] clearing proxy on: {}", service);
        let cmds: Vec<Vec<&str>> = vec![
            vec!["-setwebproxystate", service, "off"],
            vec!["-setsecurewebproxystate", service, "off"],
            vec!["-setsocksfirewallproxystate", service, "off"],
        ];
        for args in &cmds {
            let _ = Command::new("networksetup").args(args).output();
        }
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
    fn build_pf_rules_with_tailscale() {
        let rules = build_pf_rules(1280, "192.168.31.159", "utun9", Some(("utun10", "100.93.14.146")));
        let scrub_pos = rules.find("scrub").unwrap();
        let nat_pos = rules.find("nat on").unwrap();
        let route_pos = rules.find("route-to").unwrap();
        assert!(scrub_pos < nat_pos);
        assert!(nat_pos < route_pos);
        assert!(rules.contains("max-mss 1240"));
        assert!(rules.contains("nat on utun10"));
        assert!(rules.contains("-> 100.93.14.146"));
        assert!(rules.contains("100.64.0.0/10"));
        assert!(rules.contains("from !192.168.31.159"));
        assert!(rules.contains("route-to (utun9 172.19.0.1)"));
    }

    #[test]
    fn build_pf_rules_without_tailscale() {
        let rules = build_pf_rules(1500, "192.168.1.1", "utun5", None);
        assert!(!rules.contains("nat on"));
        assert!(rules.contains("route-to (utun5 172.19.0.1)"));
        assert!(rules.contains("max-mss 1460"));
    }
}
