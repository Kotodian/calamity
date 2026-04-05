use std::net::Ipv4Addr;
use tokio::net::TcpListener;
use tokio::sync::watch;

use super::fsm;

pub struct BgpSpeaker {
    shutdown_tx: watch::Sender<bool>,
}

impl BgpSpeaker {
    pub async fn start(tailscale_ip: Ipv4Addr) -> Result<Self, String> {
        let (shutdown_tx, shutdown_rx) = watch::channel(false);

        let router_id = tailscale_ip.octets();
        let bind_addr = format!("{tailscale_ip}:17900");

        let listener = TcpListener::bind(&bind_addr)
            .await
            .map_err(|e| format!("failed to bind {bind_addr}: {e}"))?;

        eprintln!("[bgp] speaker listening on {bind_addr}");

        let mut rx = shutdown_rx;
        tokio::spawn(async move {
            loop {
                tokio::select! {
                    accept_result = listener.accept() => {
                        match accept_result {
                            Ok((stream, peer_addr)) => {
                                eprintln!("[bgp] incoming connection from {peer_addr}");
                                let rid = router_id;
                                tokio::spawn(async move {
                                    if let Err(e) = fsm::serve_rules(stream, rid).await {
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

        Ok(Self { shutdown_tx })
    }

    pub fn stop(&self) {
        let _ = self.shutdown_tx.send(true);
    }
}

/// Find local Tailscale IP (100.64-127.x.x.x CGNAT range).
/// Delegates to platform-specific implementation.
pub fn get_tailscale_ip() -> Option<Ipv4Addr> {
    crate::platform::get_tailscale_ip()
}
