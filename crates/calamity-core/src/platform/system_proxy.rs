//! System proxy management — macOS networksetup / Linux gsettings+KDE.

use std::process::Command;

pub fn set_system_proxy(http_port: u16, socks_port: u16) {
    #[cfg(target_os = "macos")]
    {
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
    #[cfg(target_os = "linux")]
    {
        let http_str = http_port.to_string();
        let socks_str = socks_port.to_string();
        // Try GNOME
        if Command::new("gsettings")
            .args(["set", "org.gnome.system.proxy", "mode", "manual"])
            .output()
            .is_ok()
        {
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
        // Try KDE
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
}

pub fn clear_system_proxy() {
    #[cfg(target_os = "macos")]
    {
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
    #[cfg(target_os = "linux")]
    {
        if Command::new("gsettings")
            .args(["set", "org.gnome.system.proxy", "mode", "none"])
            .output()
            .is_ok()
        {
            eprintln!("[system-proxy] GNOME proxy cleared");
            return;
        }
        let _ = Command::new("kwriteconfig5")
            .args(["--file", "kioslaverc", "--group", "Proxy Settings", "--key", "ProxyType", "0"])
            .output();
        eprintln!("[system-proxy] attempted KDE proxy clear");
    }
}

#[cfg(target_os = "macos")]
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
