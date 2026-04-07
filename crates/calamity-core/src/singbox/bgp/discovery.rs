use std::collections::HashSet;
use std::net::SocketAddr;
use std::time::Duration;

const MDNS_SERVICE_TYPE: &str = "_calamity-bgp._tcp.local.";
const BGP_PORT: u16 = 17900;

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredPeer {
    pub name: String,
    pub address: String,
    pub source: DiscoverySource,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum DiscoverySource {
    Mdns,
    Tailscale,
}

/// Register this instance as a discoverable mDNS service.
/// Returns the daemon handle; drop it to unregister.
pub fn register_mdns(hostname: &str, port: u16) -> Result<mdns_sd::ServiceDaemon, String> {
    let mdns = mdns_sd::ServiceDaemon::new().map_err(|e| format!("mDNS daemon: {e}"))?;
    let service_info = mdns_sd::ServiceInfo::new(
        MDNS_SERVICE_TYPE,
        hostname,
        hostname,
        "",
        port,
        None::<std::collections::HashMap<String, String>>,
    )
    .map_err(|e| format!("mDNS service info: {e}"))?;
    mdns.register(service_info)
        .map_err(|e| format!("mDNS register: {e}"))?;
    eprintln!("[bgp-discovery] registered mDNS service: {hostname}");
    Ok(mdns)
}

/// Browse for Calamity peers on the local network via mDNS.
pub async fn discover_mdns(timeout: Duration) -> Vec<DiscoveredPeer> {
    let mdns = match mdns_sd::ServiceDaemon::new() {
        Ok(d) => d,
        Err(e) => {
            eprintln!("[bgp-discovery] mDNS browse init failed: {e}");
            return vec![];
        }
    };

    let receiver = match mdns.browse(MDNS_SERVICE_TYPE) {
        Ok(r) => r,
        Err(e) => {
            eprintln!("[bgp-discovery] mDNS browse failed: {e}");
            return vec![];
        }
    };

    let mut peers = Vec::new();
    let deadline = tokio::time::Instant::now() + timeout;

    loop {
        let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
        if remaining.is_zero() {
            break;
        }

        match tokio::time::timeout(remaining, tokio::task::spawn_blocking({
            let receiver = receiver.clone();
            move || receiver.recv_timeout(Duration::from_secs(1))
        }))
        .await
        {
            Ok(Ok(Ok(mdns_sd::ServiceEvent::ServiceResolved(info)))) => {
                if let Some(addr) = info.get_addresses_v4().into_iter().next() {
                    peers.push(DiscoveredPeer {
                        name: info.get_hostname().trim_end_matches('.').to_string(),
                        address: addr.to_string(),
                        source: DiscoverySource::Mdns,
                    });
                }
            }
            Ok(Ok(Ok(_))) => {} // other events (SearchStarted, ServiceFound, etc.)
            _ => break,
        }
    }

    let _ = mdns.stop_browse(MDNS_SERVICE_TYPE);
    let _ = mdns.shutdown();
    peers
}

/// Discover peers via Tailscale: list all devices, probe port 17900.
pub async fn discover_tailscale() -> Vec<DiscoveredPeer> {
    use crate::singbox::tailscale_api;
    use crate::singbox::tailscale_storage;

    let mut ts_settings = tailscale_storage::load_tailscale_settings();
    let devices = match tailscale_api::fetch_devices(&mut ts_settings).await {
        Ok(d) => d,
        Err(e) => {
            eprintln!("[bgp-discovery] Tailscale API failed: {e}");
            return vec![];
        }
    };

    // Use local IP to filter self instead of hostname (multiple devices can share hostname)
    let local_ip = crate::platform::get_tailscale_ip().map(|ip| ip.to_string());

    let mut peers = Vec::new();
    for device in devices {
        if device.ip.is_empty() || local_ip.as_deref() == Some(&device.ip) {
            continue;
        }
        let addr = format!("{}:{}", device.ip, BGP_PORT);
        if let Ok(socket_addr) = addr.parse::<SocketAddr>() {
            match tokio::time::timeout(
                Duration::from_secs(2),
                tokio::net::TcpStream::connect(socket_addr),
            )
            .await
            {
                Ok(Ok(_)) => {
                    peers.push(DiscoveredPeer {
                        name: device.name,
                        address: device.ip,
                        source: DiscoverySource::Tailscale,
                    });
                }
                _ => {} // Not reachable or no BGP speaker
            }
        }
    }

    peers
}

/// Discover peers from all sources (mDNS + Tailscale), deduplicated by address.
pub async fn discover_all() -> Vec<DiscoveredPeer> {
    let (mdns_peers, ts_peers) = tokio::join!(
        discover_mdns(Duration::from_secs(3)),
        discover_tailscale()
    );

    let mut all = mdns_peers;
    let existing_addrs: HashSet<String> = all.iter().map(|p| p.address.clone()).collect();
    for p in ts_peers {
        if !existing_addrs.contains(&p.address) {
            all.push(p);
        }
    }
    all
}
