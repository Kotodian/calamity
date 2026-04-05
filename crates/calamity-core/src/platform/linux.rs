use std::net::Ipv4Addr;
use std::process::Command;
use std::sync::Mutex;

const NFT_TABLE: &str = "calamity";

static INHIBIT_CHILD: Mutex<Option<std::process::Child>> = Mutex::new(None);

// --- IP Forwarding ---

pub fn get_ip_forwarding() -> bool {
    Command::new("sysctl")
        .args(["-n", "net.ipv4.ip_forward"])
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
    let output = Command::new("sysctl")
        .args(["-w", "net.ipv4.ip_forward=1"])
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
    let output = Command::new("sysctl")
        .args(["-w", "net.ipv4.ip_forward=0"])
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

/// Detect the primary LAN interface IP (first non-loopback, non-tailscale interface with an IPv4).
pub fn detect_lan_ip() -> Option<String> {
    let output = Command::new("ip")
        .args(["-4", "-o", "addr", "show", "scope", "global"])
        .output()
        .ok()?;
    let text = String::from_utf8_lossy(&output.stdout);
    for line in text.lines() {
        // Format: "2: eth0    inet 192.168.1.100/24 ..."
        // Skip tailscale interfaces (tailscale0)
        if line.contains("tailscale") {
            continue;
        }
        if let Some(ip) = parse_ip_addr_line(line) {
            return Some(ip);
        }
    }
    None
}

/// Detect TUN interface from route to 172.19.0.1.
pub fn detect_tun_interface() -> Option<String> {
    let output = Command::new("ip")
        .args(["route", "show", "172.19.0.0/30"])
        .output()
        .ok()?;
    let text = String::from_utf8_lossy(&output.stdout);
    // Format: "172.19.0.0/30 dev tun0 ..."
    for line in text.lines() {
        if let Some(dev_pos) = line.find("dev ") {
            let rest = &line[dev_pos + 4..];
            return rest.split_whitespace().next().map(|s| s.to_string());
        }
    }
    None
}

/// Detect Tailscale interface from the 100.64.0.0/10 route.
pub fn detect_tailscale_interface() -> Option<String> {
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

pub fn get_interface_ip(iface: &str) -> Option<String> {
    let output = Command::new("ip")
        .args(["-4", "-o", "addr", "show", "dev", iface])
        .output()
        .ok()?;
    let text = String::from_utf8_lossy(&output.stdout);
    for line in text.lines() {
        if let Some(ip) = parse_ip_addr_line(line) {
            return Some(ip);
        }
    }
    None
}

/// Parse an `ip -o addr` line to extract the IPv4 address (without prefix length).
fn parse_ip_addr_line(line: &str) -> Option<String> {
    // Format: "2: eth0    inet 192.168.1.100/24 brd 192.168.1.255 ..."
    let inet_pos = line.find("inet ")?;
    let rest = &line[inet_pos + 5..];
    let cidr = rest.split_whitespace().next()?;
    // Strip /prefix
    Some(cidr.split('/').next()?.to_string())
}

// --- nftables Rules ---

/// Build nftables ruleset for gateway mode.
///
/// Creates a table "calamity" with:
/// - SNAT chain: masquerade LAN��Tailscale traffic
/// - FORWARD chain: allow forwarded traffic, clamp MSS
/// - PREROUTING chain: mark LAN traffic for policy routing (to TUN)
pub fn build_nft_rules(
    mtu: u16,
    lan_ip: &str,
    lan_iface: &str,
    tun_iface: &str,
    ts: Option<(&str, &str)>,
) -> String {
    let max_mss = mtu.saturating_sub(40);
    let mut rules = String::new();

    rules.push_str(&format!("table ip {} {{\n", NFT_TABLE));

    // Chain: postrouting SNAT
    rules.push_str("  chain postrouting {\n");
    rules.push_str("    type nat hook postrouting priority srcnat; policy accept;\n");
    if let Some((ts_iface, ts_ip)) = ts {
        rules.push_str(&format!(
            "    iifname \"{}\" oifname \"{}\" ip daddr 100.64.0.0/10 snat to {}\n",
            lan_iface, ts_iface, ts_ip
        ));
    }
    // Masquerade forwarded traffic going through TUN
    rules.push_str(&format!(
        "    iifname \"{}\" oifname \"{}\" masquerade\n",
        lan_iface, tun_iface
    ));
    rules.push_str("  }\n\n");

    // Chain: forward — allow and clamp MSS
    rules.push_str("  chain forward {\n");
    rules.push_str("    type filter hook forward priority filter; policy accept;\n");
    rules.push_str(&format!(
        "    iifname \"{}\" tcp flags syn tcp option maxseg size set {}\n",
        lan_iface, max_mss
    ));
    rules.push_str("  }\n\n");

    // Chain: prerouting — mark traffic for policy routing
    rules.push_str("  chain prerouting {\n");
    rules.push_str("    type filter hook prerouting priority mangle; policy accept;\n");
    rules.push_str(&format!(
        "    iifname \"{}\" ip saddr != {} ip daddr != {{ 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8 }} mark set 0x1\n",
        lan_iface, lan_ip
    ));
    rules.push_str("  }\n");

    rules.push_str("}\n");
    rules
}

pub fn enable_nft_rules(mtu: u16, tailscale_ip: Option<&str>) -> Result<(), String> {
    let lan_ip = detect_lan_ip().ok_or("failed to detect LAN IP")?;
    let lan_iface = detect_lan_interface().ok_or("failed to detect LAN interface")?;
    let tun_iface = detect_tun_interface().ok_or("failed to detect TUN interface")?;

    let ts = detect_tailscale_interface().and_then(|iface| {
        let ip = tailscale_ip.map(|s| s.to_string()).or_else(|| get_interface_ip(&iface))?;
        Some((iface, ip))
    });

    let rules = build_nft_rules(
        mtu,
        &lan_ip,
        &lan_iface,
        &tun_iface,
        ts.as_ref().map(|(i, ip)| (i.as_str(), ip.as_str())),
    );

    // Flush existing table first (ignore error if it doesn't exist)
    let _ = Command::new("nft")
        .args(["delete", "table", "ip", NFT_TABLE])
        .output();

    let output = Command::new("nft")
        .arg("-f")
        .arg("-")
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
        .map_err(|e| format!("failed to load nft rules: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "nft failed: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }

    // Add ip rule for marked packets → TUN
    let _ = Command::new("ip")
        .args(["rule", "add", "fwmark", "1", "table", "100"])
        .output();
    let _ = Command::new("ip")
        .args(["route", "add", "default", "dev", &tun_iface, "table", "100"])
        .output();

    eprintln!(
        "[gateway] nft rules enabled (tun={}, lan={}:{}, ts={}, max-mss={})",
        tun_iface,
        lan_iface,
        lan_ip,
        ts.as_ref()
            .map(|(i, ip)| format!("{}:{}", i, ip))
            .unwrap_or_else(|| "none".to_string()),
        mtu.saturating_sub(40)
    );
    Ok(())
}

pub fn disable_nft_rules() {
    // Remove nft table
    let output = Command::new("nft")
        .args(["delete", "table", "ip", NFT_TABLE])
        .output();
    match output {
        Ok(o) if o.status.success() => eprintln!("[gateway] nft rules disabled"),
        Ok(o) => eprintln!(
            "[gateway] failed to delete nft table: {}",
            String::from_utf8_lossy(&o.stderr).trim()
        ),
        Err(e) => eprintln!("[gateway] failed to delete nft table: {}", e),
    }

    // Clean up policy routing
    let _ = Command::new("ip")
        .args(["rule", "del", "fwmark", "1", "table", "100"])
        .output();
    let _ = Command::new("ip")
        .args(["route", "del", "default", "table", "100"])
        .output();
}

/// Detect the primary LAN interface name.
fn detect_lan_interface() -> Option<String> {
    let output = Command::new("ip")
        .args(["-4", "-o", "addr", "show", "scope", "global"])
        .output()
        .ok()?;
    let text = String::from_utf8_lossy(&output.stdout);
    for line in text.lines() {
        if line.contains("tailscale") {
            continue;
        }
        // Format: "2: eth0    inet ..."
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 2 {
            return Some(parts[1].trim_end_matches(':').to_string());
        }
    }
    None
}

// --- Sleep Prevention ---

pub fn prevent_sleep() {
    let mut guard = INHIBIT_CHILD.lock().unwrap();
    if guard.is_some() {
        return;
    }
    match Command::new("systemd-inhibit")
        .args([
            "--what=sleep:idle",
            "--who=calamity",
            "--why=Gateway mode active",
            "--mode=block",
            "sleep", "infinity",
        ])
        .spawn()
    {
        Ok(child) => {
            eprintln!("[gateway] sleep prevention enabled (pid={})", child.id());
            *guard = Some(child);
        }
        Err(e) => eprintln!("[gateway] failed to start systemd-inhibit: {}", e),
    }
}

pub fn allow_sleep() {
    let mut guard = INHIBIT_CHILD.lock().unwrap();
    if let Some(ref mut child) = *guard {
        let _ = child.kill();
        let _ = child.wait();
        eprintln!("[gateway] sleep prevention disabled");
    }
    *guard = None;
}

// --- System Proxy (GNOME gsettings) ---

pub fn set_system_proxy(http_port: u16, socks_port: u16) {
    let http_str = http_port.to_string();
    let socks_str = socks_port.to_string();

    // Try GNOME gsettings
    let gsettings = Command::new("gsettings")
        .args(["set", "org.gnome.system.proxy", "mode", "manual"])
        .output();

    if gsettings.is_ok() {
        let cmds: Vec<Vec<&str>> = vec![
            vec!["set", "org.gnome.system.proxy.http", "host", "127.0.0.1"],
            vec!["set", "org.gnome.system.proxy.http", "port", &http_str],
            vec!["set", "org.gnome.system.proxy.https", "host", "127.0.0.1"],
            vec!["set", "org.gnome.system.proxy.https", "port", &http_str],
            vec!["set", "org.gnome.system.proxy.socks", "host", "127.0.0.1"],
            vec!["set", "org.gnome.system.proxy.socks", "port", &socks_str],
        ];
        for args in &cmds {
            let _ = Command::new("gsettings").args(args).output();
        }
        eprintln!("[system-proxy] GNOME proxy set");
        return;
    }

    // Try KDE kwriteconfig5
    let kde_cmds: Vec<Vec<&str>> = vec![
        vec!["--file", "kioslaverc", "--group", "Proxy Settings", "--key", "ProxyType", "1"],
        vec!["--file", "kioslaverc", "--group", "Proxy Settings", "--key", "httpProxy", &format!("http://127.0.0.1:{}", http_port)],
        vec!["--file", "kioslaverc", "--group", "Proxy Settings", "--key", "httpsProxy", &format!("http://127.0.0.1:{}", http_port)],
        vec!["--file", "kioslaverc", "--group", "Proxy Settings", "--key", "socksProxy", &format!("socks://127.0.0.1:{}", socks_port)],
    ];
    // kwriteconfig5 args contain formatted strings, handle differently
    let _ = Command::new("kwriteconfig5")
        .args(["--file", "kioslaverc", "--group", "Proxy Settings", "--key", "ProxyType", "1"])
        .output();
    let _ = Command::new("kwriteconfig5")
        .args(["--file", "kioslaverc", "--group", "Proxy Settings", "--key", "httpProxy",
               &format!("http://127.0.0.1:{}", http_port)])
        .output();
    let _ = Command::new("kwriteconfig5")
        .args(["--file", "kioslaverc", "--group", "Proxy Settings", "--key", "httpsProxy",
               &format!("http://127.0.0.1:{}", http_port)])
        .output();
    let _ = Command::new("kwriteconfig5")
        .args(["--file", "kioslaverc", "--group", "Proxy Settings", "--key", "socksProxy",
               &format!("socks://127.0.0.1:{}", socks_port)])
        .output();
    eprintln!("[system-proxy] attempted KDE proxy set");
}

pub fn clear_system_proxy() {
    // GNOME
    let gsettings = Command::new("gsettings")
        .args(["set", "org.gnome.system.proxy", "mode", "none"])
        .output();

    if gsettings.is_ok() {
        eprintln!("[system-proxy] GNOME proxy cleared");
        return;
    }

    // KDE
    let _ = Command::new("kwriteconfig5")
        .args(["--file", "kioslaverc", "--group", "Proxy Settings", "--key", "ProxyType", "0"])
        .output();
    eprintln!("[system-proxy] attempted KDE proxy clear");
}

// --- Tailscale IP Detection ---

pub fn get_tailscale_ip() -> Option<Ipv4Addr> {
    let output = Command::new("ip")
        .args(["-4", "-o", "addr", "show"])
        .output()
        .ok()?;
    let text = String::from_utf8_lossy(&output.stdout);
    for line in text.lines() {
        if let Some(ip_str) = parse_ip_addr_line(line) {
            if let Ok(ip) = ip_str.parse::<Ipv4Addr>() {
                let octets = ip.octets();
                if octets[0] == 100 && (64..=127).contains(&octets[1]) {
                    return Some(ip);
                }
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_ip_addr_line_extracts_ip() {
        let line = "2: eth0    inet 192.168.1.100/24 brd 192.168.1.255 scope global eth0";
        assert_eq!(parse_ip_addr_line(line), Some("192.168.1.100".to_string()));
    }

    #[test]
    fn parse_ip_addr_line_returns_none_for_no_inet() {
        let line = "1: lo    <LOOPBACK,UP,LOWER_UP>";
        assert_eq!(parse_ip_addr_line(line), None);
    }

    #[test]
    fn build_nft_rules_with_tailscale() {
        let rules = build_nft_rules(
            1280,
            "192.168.1.100",
            "eth0",
            "tun0",
            Some(("tailscale0", "100.93.14.146")),
        );

        // Has correct table name
        assert!(rules.contains("table ip calamity"));

        // Has SNAT for Tailscale
        assert!(rules.contains("snat to 100.93.14.146"));
        assert!(rules.contains("100.64.0.0/10"));

        // Has masquerade for TUN
        assert!(rules.contains("iifname \"eth0\" oifname \"tun0\" masquerade"));

        // Has MSS clamping
        assert!(rules.contains("tcp option maxseg size set 1240"));

        // Has prerouting mark for policy routing
        assert!(rules.contains("mark set 0x1"));
        assert!(rules.contains("ip saddr != 192.168.1.100"));

        // Excludes private ranges
        assert!(rules.contains("10.0.0.0/8"));
        assert!(rules.contains("192.168.0.0/16"));
    }

    #[test]
    fn build_nft_rules_without_tailscale() {
        let rules = build_nft_rules(1500, "192.168.1.1", "eth0", "tun0", None);

        assert!(!rules.contains("snat"));
        assert!(rules.contains("masquerade"));
        assert!(rules.contains("tcp option maxseg size set 1460"));
        assert!(rules.contains("mark set 0x1"));
    }

    #[test]
    fn build_nft_rules_chain_order() {
        let rules = build_nft_rules(1500, "10.0.0.1", "br0", "tun0", None);

        // All three chains should be present
        assert!(rules.contains("chain postrouting"));
        assert!(rules.contains("chain forward"));
        assert!(rules.contains("chain prerouting"));

        // Verify ordering: postrouting → forward → prerouting
        let post_pos = rules.find("chain postrouting").unwrap();
        let fwd_pos = rules.find("chain forward").unwrap();
        let pre_pos = rules.find("chain prerouting").unwrap();
        assert!(post_pos < fwd_pos);
        assert!(fwd_pos < pre_pos);
    }
}
