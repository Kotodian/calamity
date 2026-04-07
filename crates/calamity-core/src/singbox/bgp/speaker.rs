use std::net::Ipv4Addr;
use tokio::io::AsyncWriteExt;
use tokio::net::TcpListener;
use tokio::sync::watch;

use super::{codec, fsm, sync_session};

pub struct BgpSpeaker {
    shutdown_tx: watch::Sender<bool>,
    _mdns: Option<mdns_sd::ServiceDaemon>,
}

impl BgpSpeaker {
    pub async fn start(
        on_remote_update: Option<sync_session::OnSyncApplied>,
    ) -> Result<Self, String> {
        let (shutdown_tx, shutdown_rx) = watch::channel(false);
        let router_id = get_router_id();
        let bind_addr = "0.0.0.0:17900".to_string();

        let listener = TcpListener::bind(&bind_addr)
            .await
            .map_err(|e| format!("failed to bind {bind_addr}: {e}"))?;

        eprintln!("[bgp] speaker listening on {bind_addr}");

        // Register mDNS service for LAN discovery
        let sys_hostname = hostname::get()
            .ok()
            .and_then(|h| h.into_string().ok())
            .unwrap_or_else(|| "calamity".to_string());
        let mdns = super::discovery::register_mdns(&sys_hostname, 17900).ok();

        let mut rx = shutdown_rx;
        tokio::spawn(async move {
            loop {
                tokio::select! {
                    accept_result = listener.accept() => {
                        match accept_result {
                            Ok((mut stream, peer_addr)) => {
                                eprintln!("[bgp] incoming connection from {peer_addr}");
                                let rid = router_id;
                                let callback = on_remote_update.clone();
                                tokio::spawn(async move {
                                    if let Err(e) = handle_incoming(&mut stream, rid, callback).await {
                                        eprintln!("[bgp] error serving {peer_addr}: {e}");
                                    }
                                });
                            }
                            Err(e) => {
                                eprintln!("[bgp] accept error: {e}");
                            }
                        }
                    }
                    _ = rx.changed() => {
                        if *rx.borrow() {
                            eprintln!("[bgp] speaker shutting down");
                            break;
                        }
                    }
                }
            }
        });

        Ok(Self { shutdown_tx, _mdns: mdns })
    }

    pub fn stop(&self) {
        let _ = self.shutdown_tx.send(true);
    }
}

/// Handle an incoming connection: handshake, send local data, then either
/// long-lived bidirectional loop (if callback set) or one-shot serve.
async fn handle_incoming(
    stream: &mut tokio::net::TcpStream,
    router_id: [u8; 4],
    on_remote_update: Option<sync_session::OnSyncApplied>,
) -> Result<(), String> {
    fsm::handshake_server(stream, router_id).await?;

    let peer_addr = stream.peer_addr().map(|a| a.to_string()).unwrap_or_default();
    eprintln!("[bgp] session established with {peer_addr} (serving)");

    // Send local data
    let entries = sync_session::collect_local_data();
    stream
        .write_all(&fsm::build_update(&entries))
        .await
        .map_err(|e| format!("send UPDATE: {e}"))?;

    if let Some(callback) = on_remote_update {
        // Long-lived: read updates from peer indefinitely
        loop {
            match tokio::time::timeout(
                std::time::Duration::from_secs(90),
                fsm::read_message(stream),
            ).await {
                Ok(Ok((fsm::MSG_UPDATE, body))) => {
                    let parsed = fsm::parse_update_entries(&body)?;
                    if !parsed.is_empty() {
                        let sync_data = codec::decode_sync_data(&parsed)?;
                        eprintln!(
                            "[bgp] received {} rules from {peer_addr}",
                            sync_data.rules.rules.len()
                        );
                        // Merge is handled by the caller through the callback
                        callback();
                    }
                }
                Ok(Ok((fsm::MSG_KEEPALIVE, _))) => {
                    stream.write_all(&fsm::build_keepalive()).await
                        .map_err(|e| format!("send KEEPALIVE: {e}"))?;
                }
                Ok(Ok((fsm::MSG_NOTIFICATION, _))) => {
                    return Err("peer sent NOTIFICATION".to_string());
                }
                Ok(Ok(_)) => {}
                Ok(Err(e)) => return Err(e),
                Err(_) => return Err("peer timeout".to_string()),
            }
        }
    } else {
        // One-shot: send end-of-rib and close (backward compat)
        stream.write_all(&fsm::build_update(&[])).await
            .map_err(|e| format!("send end-of-rib: {e}"))?;
        let _ = tokio::time::timeout(std::time::Duration::from_secs(5), async {
            let mut buf = [0u8; 1];
            let _ = tokio::io::AsyncReadExt::read(stream, &mut buf).await;
        }).await;
        let _ = stream.shutdown().await;
    }

    Ok(())
}

/// Find local Tailscale IP (100.64-127.x.x.x CGNAT range).
pub fn get_tailscale_ip() -> Option<Ipv4Addr> {
    crate::platform::get_tailscale_ip()
}

/// Get a router ID for BGP. Prefer Tailscale IP, fall back to any interface IP.
pub fn get_router_id() -> [u8; 4] {
    if let Some(ip) = get_tailscale_ip() {
        return ip.octets();
    }
    for iface in if_addrs::get_if_addrs().unwrap_or_default() {
        if let std::net::IpAddr::V4(ip) = iface.ip() {
            if !ip.is_loopback() {
                return ip.octets();
            }
        }
    }
    [10, 0, 0, 1]
}
