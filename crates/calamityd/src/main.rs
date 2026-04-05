use std::path::PathBuf;
use std::sync::Arc;

use calamity_core::ipc::protocol::{Command, Response};
use calamity_core::ipc::server::IpcServer;
use calamity_core::singbox::{
    bgp::{fsm, speaker, storage as bgp_storage},
    process::SingboxProcess,
    rules_storage, storage,
    tailscale_api, tailscale_storage,
};
use tokio::sync::Mutex;

/// Daemon state shared between IPC handler and signal handlers.
struct DaemonState {
    process: SingboxProcess,
    bgp_speaker: Option<speaker::BgpSpeaker>,
}

#[tokio::main]
async fn main() {
    eprintln!("[calamityd] starting v{}", env!("CARGO_PKG_VERSION"));

    // app_data_dir() auto-detects: root → /etc/calamity, user → ~/.config/calamity
    let config_dir = storage::app_data_dir();
    eprintln!("[calamityd] config dir: {}", config_dir.display());

    // Load settings and create process
    let settings = storage::load_settings();
    let singbox_path = if settings.singbox_path.is_empty() {
        "/usr/lib/calamity/sing-box".to_string()
    } else {
        settings.singbox_path.clone()
    };

    let process = SingboxProcess::new(singbox_path);

    // Start BGP speaker if Tailscale is available
    let bgp_speaker = if bgp_storage::load_bgp_settings().enabled {
        if let Some(ip) = calamity_core::platform::get_tailscale_ip() {
            match speaker::BgpSpeaker::start(ip).await {
                Ok(s) => {
                    eprintln!("[calamityd] BGP speaker started on {ip}");
                    Some(s)
                }
                Err(e) => {
                    eprintln!("[calamityd] BGP speaker failed: {e}");
                    None
                }
            }
        } else {
            eprintln!("[calamityd] Tailscale not detected, BGP disabled");
            None
        }
    } else {
        None
    };

    let state = Arc::new(Mutex::new(DaemonState {
        process,
        bgp_speaker,
    }));

    // Start IPC server
    let socket_path = PathBuf::from("/run/calamity/calamity.sock");
    let handler_state = state.clone();

    let server = IpcServer::start(&socket_path, calamity_core::ipc::server::handler_fn(move |req| {
        let state = handler_state.clone();
        async move { handle_command(state, req.command).await }
    }))
    .await
    .unwrap_or_else(|e| {
        eprintln!("[calamityd] failed to start IPC server: {e}");
        std::process::exit(1);
    });

    eprintln!("[calamityd] ready");

    // Notify systemd we're ready (sd_notify)
    if let Ok(addr) = std::env::var("NOTIFY_SOCKET") {
        let _ = sd_notify(&addr, "READY=1");
    }

    // Wait for shutdown signal
    let shutdown_state = state.clone();
    tokio::select! {
        _ = tokio::signal::ctrl_c() => {
            eprintln!("[calamityd] received SIGINT");
        }
        _ = wait_for_sigterm() => {
            eprintln!("[calamityd] received SIGTERM");
        }
    }

    // Cleanup
    eprintln!("[calamityd] shutting down...");
    {
        let mut s = shutdown_state.lock().await;
        s.process.stop().await;
        if let Some(bgp) = s.bgp_speaker.take() {
            bgp.stop();
        }
    }
    calamity_core::platform::clear_system_proxy();
    calamity_core::platform::disable_redirect();
    server.stop();

    eprintln!("[calamityd] stopped");
}

async fn handle_command(state: Arc<Mutex<DaemonState>>, cmd: Command) -> Response {
    match cmd {
        Command::Start => {
            let mut s = state.lock().await;
            let settings = storage::load_settings();
            match s.process.start(&settings).await {
                Ok(()) => Response::Ok(serde_json::json!("started")),
                Err(e) => Response::Error(e),
            }
        }
        Command::Stop => {
            let mut s = state.lock().await;
            s.process.stop().await;
            Response::Ok(serde_json::json!("stopped"))
        }
        Command::Restart => {
            let mut s = state.lock().await;
            let settings = storage::load_settings();
            match s.process.restart(&settings).await {
                Ok(()) => Response::Ok(serde_json::json!("restarted")),
                Err(e) => Response::Error(e),
            }
        }
        Command::Status => {
            let s = state.lock().await;
            let running = s.process.is_running().await;
            let settings = storage::load_settings();
            Response::Ok(serde_json::json!({
                "running": running,
                "mode": settings.proxy_mode,
                "httpPort": settings.http_port,
                "socksPort": settings.socks_port,
            }))
        }
        Command::SetProxyMode { mode } => {
            let mut settings = storage::load_settings();
            settings.proxy_mode = mode;
            match storage::save_settings(&settings) {
                Ok(()) => {
                    let s = state.lock().await;
                    let _ = s.process.reload(&settings).await;
                    Response::Ok(serde_json::json!("ok"))
                }
                Err(e) => Response::Error(e),
            }
        }
        Command::GetNodes => {
            let nodes = calamity_core::singbox::nodes_storage::load_nodes();
            Response::Ok(serde_json::to_value(&nodes).unwrap_or_default())
        }
        Command::SelectNode { group, node } => {
            let mut nodes = calamity_core::singbox::nodes_storage::load_nodes();
            // Find the node in the group and set as active
            let found = nodes.groups.iter().any(|g| {
                g.name == group && g.nodes.iter().any(|n| n.name == node)
            });
            if !found {
                return Response::Error(format!("node '{node}' not found in group '{group}'"));
            }
            nodes.active_node = Some(node);
            match calamity_core::singbox::nodes_storage::save_nodes(&nodes) {
                Ok(()) => {
                    let s = state.lock().await;
                    let settings = storage::load_settings();
                    let _ = s.process.reload(&settings).await;
                    Response::Ok(serde_json::json!("ok"))
                }
                Err(e) => Response::Error(e),
            }
        }
        Command::LatencyTest { group, node } => {
            let s = state.lock().await;
            let target = node.unwrap_or(group);
            match s.process.api().test_delay(&target, 5000).await {
                Ok(delay) => Response::Ok(serde_json::json!({"node": target, "delay": delay})),
                Err(e) => Response::Error(e),
            }
        }
        Command::GetRules => {
            let rules = rules_storage::load_rules();
            Response::Ok(serde_json::to_value(&rules).unwrap_or_default())
        }
        Command::AddRule { rule } => {
            let mut data = rules_storage::load_rules();
            data.rules.push(rule);
            match rules_storage::save_rules(&data) {
                Ok(()) => {
                    let s = state.lock().await;
                    let settings = storage::load_settings();
                    let _ = s.process.reload(&settings).await;
                    Response::Ok(serde_json::json!("ok"))
                }
                Err(e) => Response::Error(e),
            }
        }
        Command::RemoveRule { id } => {
            let mut data = rules_storage::load_rules();
            data.rules.retain(|r| r.id != id);
            match rules_storage::save_rules(&data) {
                Ok(()) => {
                    let s = state.lock().await;
                    let settings = storage::load_settings();
                    let _ = s.process.reload(&settings).await;
                    Response::Ok(serde_json::json!("ok"))
                }
                Err(e) => Response::Error(e),
            }
        }
        Command::GetSubscriptions => {
            let subs = calamity_core::singbox::subscriptions_storage::load_subscriptions();
            Response::Ok(serde_json::to_value(&subs).unwrap_or_default())
        }
        Command::UpdateSubscription { id: _ } => {
            // TODO: implement subscription update via fetch
            Response::Error("subscription update not yet implemented in daemon".to_string())
        }
        Command::GetDnsServers => {
            let dns = calamity_core::singbox::dns_storage::load_dns_settings();
            Response::Ok(serde_json::to_value(&dns).unwrap_or_default())
        }
        Command::GetSettings => {
            let settings = storage::load_settings();
            Response::Ok(serde_json::to_value(&settings).unwrap_or_default())
        }
        Command::UpdateSettings { settings: updates } => {
            let mut settings = storage::load_settings();
            // Merge updates into current settings
            let mut json = serde_json::to_value(&settings).unwrap_or_default();
            if let (Some(base), Some(upd)) = (json.as_object_mut(), updates.as_object()) {
                for (k, v) in upd {
                    base.insert(k.clone(), v.clone());
                }
            }
            match serde_json::from_value::<storage::AppSettings>(json) {
                Ok(new_settings) => {
                    if let Err(e) = storage::save_settings(&new_settings) {
                        return Response::Error(e);
                    }
                    let s = state.lock().await;
                    let _ = s.process.reload(&new_settings).await;
                    Response::Ok(serde_json::json!("ok"))
                }
                Err(e) => Response::Error(format!("invalid settings: {e}")),
            }
        }
        Command::BgpGetSettings => {
            let settings = bgp_storage::load_bgp_settings();
            Response::Ok(serde_json::to_value(&settings).unwrap_or_default())
        }
        Command::BgpPullRules { peer_addr } => {
            let local_ip = match calamity_core::platform::get_tailscale_ip() {
                Some(ip) => ip,
                None => return Response::Error("Tailscale IP not found".to_string()),
            };
            match fsm::pull_rules(&peer_addr, local_ip.octets()).await {
                Ok(result) => {
                    let local = rules_storage::load_rules();
                    let diff = compute_simple_diff(&local, &result.remote_rules);
                    Response::Ok(serde_json::to_value(&diff).unwrap_or_default())
                }
                Err(e) => Response::Error(e),
            }
        }
        Command::BgpApplyRules { rules } => {
            match serde_json::from_value::<rules_storage::RulesData>(rules) {
                Ok(data) => match rules_storage::save_rules(&data) {
                    Ok(()) => {
                        let s = state.lock().await;
                        let settings = storage::load_settings();
                        let _ = s.process.reload(&settings).await;
                        Response::Ok(serde_json::json!("ok"))
                    }
                    Err(e) => Response::Error(e),
                },
                Err(e) => Response::Error(format!("invalid rules data: {e}")),
            }
        }
        Command::BgpDiscoverPeers => {
            let mut ts_settings = tailscale_storage::load_tailscale_settings();
            match tailscale_api::fetch_devices(&mut ts_settings).await {
                Ok(devices) => {
                    let peers: Vec<serde_json::Value> = devices
                        .into_iter()
                        .filter(|d| !d.is_self && d.hostname.to_lowercase().contains("calamity"))
                        .map(|d| serde_json::json!({"name": d.name, "hostname": d.hostname, "address": d.ip}))
                        .collect();
                    Response::Ok(serde_json::json!(peers))
                }
                Err(e) => Response::Error(e),
            }
        }
        Command::TailscaleStatus => {
            let ts_ip = calamity_core::platform::get_tailscale_ip();
            Response::Ok(serde_json::json!({
                "connected": ts_ip.is_some(),
                "ip": ts_ip.map(|ip| ip.to_string()),
            }))
        }
        Command::TailscaleAuth => {
            Response::Error("tailscale auth not yet implemented in daemon".to_string())
        }
        Command::TailscaleLogout => {
            Response::Error("tailscale logout not yet implemented in daemon".to_string())
        }
        Command::TailscaleSetExitNode { node: _ } => {
            Response::Error("tailscale exit-node not yet implemented in daemon".to_string())
        }
    }
}

fn compute_simple_diff(
    local: &rules_storage::RulesData,
    remote: &rules_storage::RulesData,
) -> serde_json::Value {
    let local_ids: std::collections::HashSet<&str> =
        local.rules.iter().map(|r| r.id.as_str()).collect();
    let remote_ids: std::collections::HashSet<&str> =
        remote.rules.iter().map(|r| r.id.as_str()).collect();

    let added: Vec<&str> = remote_ids.difference(&local_ids).copied().collect();
    let removed: Vec<&str> = local_ids.difference(&remote_ids).copied().collect();

    serde_json::json!({
        "added": added.len(),
        "removed": removed.len(),
        "remoteRules": remote,
    })
}

/// Simple sd_notify implementation.
fn sd_notify(addr: &str, msg: &str) -> Result<(), String> {
    use std::os::unix::net::UnixDatagram;
    let socket = UnixDatagram::unbound().map_err(|e| e.to_string())?;
    socket.send_to(msg.as_bytes(), addr).map_err(|e| e.to_string())?;
    Ok(())
}

async fn wait_for_sigterm() {
    use tokio::signal::unix::{signal, SignalKind};
    let mut sigterm = signal(SignalKind::terminate()).expect("failed to register SIGTERM");
    sigterm.recv().await;
}
