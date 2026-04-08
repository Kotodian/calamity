use std::path::PathBuf;
use std::sync::Arc;

use calamity_core::ipc::protocol::{Command, Response};
use calamity_core::ipc::server::IpcServer;
use calamity_core::singbox::{
    bgp::{fsm, speaker, storage as bgp_storage, sync_session::SyncSession},
    process::SingboxProcess,
    rules_storage, storage,
    tailscale_api, tailscale_storage,
};
use tokio::sync::Mutex;

/// Daemon state shared between IPC handler and signal handlers.
struct AppState {
    process: SingboxProcess,
    bgp_speaker: Option<speaker::BgpSpeaker>,
    sync_session: Option<SyncSession>,
}

#[tokio::main]
async fn main() {
    let _ = calamity_core::logging::init(log::LevelFilter::Info);

    log::info!("starting v{}", env!("CARGO_PKG_VERSION"));

    // app_data_dir() auto-detects: root → /etc/calamity, user → ~/.config/calamity
    let config_dir = storage::app_data_dir();
    log::info!("config dir: {}", config_dir.display());

    // Load settings and create process
    let settings = storage::load_settings();
    let singbox_path = if settings.singbox_path.is_empty() {
        "/usr/lib/calamity/sing-box".to_string()
    } else {
        settings.singbox_path.clone()
    };

    let process = SingboxProcess::new(singbox_path);

    // Restore previous running state
    let daemon_state = storage::load_daemon_state();
    if daemon_state.running {
        log::info!("restoring previous running state");
        if let Err(e) = process.start(&settings).await {
            log::error!("failed to restore sing-box: {e}");
        }
    }

    // Start BGP speaker if enabled
    let bgp_speaker = if bgp_storage::load_bgp_settings().enabled {
        match speaker::BgpSpeaker::start(None).await {
            Ok(s) => {
                log::info!("BGP speaker started on 0.0.0.0:17900");
                Some(s)
            }
            Err(e) => {
                log::error!("BGP speaker failed: {e}");
                None
            }
        }
    } else {
        None
    };

    let state = Arc::new(Mutex::new(AppState {
        process,
        bgp_speaker,
        sync_session: None,
    }));

    // Auto-start sync if active_peer is set
    {
        let bgp_settings = bgp_storage::load_bgp_settings();
        if let Some(ref active_peer_id) = bgp_settings.active_peer {
            if let Some(peer) = bgp_settings.peers.iter().find(|p| p.id == *active_peer_id || p.name == *active_peer_id) {
                let peer_addr = peer.address.clone();
                    let router_id = speaker::get_router_id();
                    let reload_state = state.clone();
                    let on_applied: std::sync::Arc<dyn Fn() + Send + Sync> = std::sync::Arc::new(move || {
                        let st = reload_state.clone();
                        tokio::spawn(async move {
                            let s = st.lock().await;
                            let settings = storage::load_settings();
                            let _ = s.process.reload(&settings).await;
                        });
                    });
                    match SyncSession::start(peer_addr, router_id, on_applied).await {
                        Ok(session) => {
                            log::info!("auto-started sync with peer {active_peer_id}");
                            state.lock().await.sync_session = Some(session);
                        }
                        Err(e) => {
                            log::error!("failed to auto-start sync: {e}");
                        }
                    }
            }
        }
    }

    // Start IPC server
    let socket_path = PathBuf::from("/run/calamity/calamity.sock");
    let handler_state = state.clone();

    let server = IpcServer::start(&socket_path, calamity_core::ipc::server::handler_fn(move |req| {
        let state = handler_state.clone();
        async move { handle_command(state, req.command).await }
    }))
    .await
    .unwrap_or_else(|e| {
        log::error!("failed to start IPC server: {e}");
        std::process::exit(1);
    });

    log::info!("ready");

    // Notify systemd we're ready (sd_notify)
    if let Ok(addr) = std::env::var("NOTIFY_SOCKET") {
        let _ = sd_notify(&addr, "READY=1");
    }

    // Wait for shutdown signal
    let shutdown_state = state.clone();
    tokio::select! {
        _ = tokio::signal::ctrl_c() => {
            log::info!("received SIGINT");
        }
        _ = wait_for_sigterm() => {
            log::info!("received SIGTERM");
        }
    }

    // Cleanup
    log::info!("shutting down...");
    {
        let mut s = shutdown_state.lock().await;
        if let Some(session) = s.sync_session.take() {
            session.stop();
        }
        s.process.stop().await;
        if let Some(bgp) = s.bgp_speaker.take() {
            bgp.stop();
        }
    }
    calamity_core::platform::clear_system_proxy();
    calamity_core::platform::disable_redirect();
    server.stop();

    log::info!("stopped");
}

async fn handle_command(state: Arc<Mutex<AppState>>, cmd: Command) -> Response {
    match cmd {
        Command::Start => {
            let mut s = state.lock().await;
            let settings = storage::load_settings();
            match s.process.start(&settings).await {
                Ok(()) => {
                    let _ = storage::save_daemon_state(&storage::DaemonState { running: true });
                    Response::Ok(serde_json::json!("started"))
                }
                Err(e) => Response::Error(e),
            }
        }
        Command::Stop => {
            let mut s = state.lock().await;
            s.process.stop().await;
            let _ = storage::save_daemon_state(&storage::DaemonState { running: false });
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
        Command::AddNode { uri, group } => {
            use calamity_core::singbox::subscription_fetch::parse_v2ray_uri;
            match parse_v2ray_uri(&uri) {
                Some(node) => {
                    let mut nodes = calamity_core::singbox::nodes_storage::load_nodes();
                    let name = node.name.clone();
                    if let Some(g) = nodes.groups.iter_mut().find(|g| g.id == group || g.name == group) {
                        g.nodes.push(node);
                    } else {
                        // Create group if it doesn't exist
                        nodes.groups.push(calamity_core::singbox::nodes_storage::NodeGroup {
                            id: group.clone(),
                            name: group,
                            group_type: "select".to_string(),
                            nodes: vec![node],
                        });
                    }
                    match calamity_core::singbox::nodes_storage::save_nodes(&nodes) {
                        Ok(()) => Response::Ok(serde_json::json!({"added": name})),
                        Err(e) => Response::Error(e),
                    }
                }
                None => Response::Error(format!("failed to parse node URI: {uri}")),
            }
        }
        Command::RemoveNode { name } => {
            let mut nodes = calamity_core::singbox::nodes_storage::load_nodes();
            let mut removed = false;
            for group in &mut nodes.groups {
                let before = group.nodes.len();
                group.nodes.retain(|n| n.name != name);
                if group.nodes.len() < before {
                    removed = true;
                }
            }
            if !removed {
                return Response::Error(format!("node '{name}' not found"));
            }
            match calamity_core::singbox::nodes_storage::save_nodes(&nodes) {
                Ok(()) => Response::Ok(serde_json::json!({"removed": name})),
                Err(e) => Response::Error(e),
            }
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
            let before = data.rules.len();
            data.rules.retain(|r| r.id != id && r.name != id);
            if data.rules.len() == before {
                return Response::Error(format!("rule '{id}' not found"));
            }
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
        Command::SetRuleEnabled { id, enabled } => {
            let mut data = rules_storage::load_rules();
            let rule = data.rules.iter_mut().find(|r| r.id == id || r.name == id);
            match rule {
                Some(r) => {
                    r.enabled = enabled;
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
                None => Response::Error(format!("rule '{id}' not found")),
            }
        }
        Command::SetFinalOutbound { outbound, node } => {
            let mut data = rules_storage::load_rules();
            data.final_outbound = outbound.clone();
            data.final_outbound_node = node.clone();
            match rules_storage::save_rules(&data) {
                Ok(()) => {
                    let s = state.lock().await;
                    let settings = storage::load_settings();
                    let _ = s.process.reload(&settings).await;
                    Response::Ok(serde_json::json!({"finalOutbound": outbound, "finalOutboundNode": node}))
                }
                Err(e) => Response::Error(e),
            }
        }
        Command::GetSubscriptions => {
            let subs = calamity_core::singbox::subscriptions_storage::load_subscriptions();
            Response::Ok(serde_json::to_value(&subs).unwrap_or_default())
        }
        Command::AddSubscription { name, url } => {
            use calamity_core::singbox::subscriptions_storage::{self, SubscriptionConfig};
            let mut data = subscriptions_storage::load_subscriptions();
            let sub = SubscriptionConfig {
                id: uuid::Uuid::new_v4().to_string(),
                name: name.clone(),
                url,
                enabled: true,
                auto_update_interval: 86400,
                last_updated: None,
                node_count: 0,
                group_id: "proxy".to_string(),
                traffic_upload: 0,
                traffic_download: 0,
                traffic_total: 0,
                expire: None,
            };
            data.subscriptions.push(sub);
            match subscriptions_storage::save_subscriptions(&data) {
                Ok(()) => Response::Ok(serde_json::json!({"added": name})),
                Err(e) => Response::Error(e),
            }
        }
        Command::RemoveSubscription { id } => {
            use calamity_core::singbox::subscriptions_storage;
            let mut data = subscriptions_storage::load_subscriptions();
            let before = data.subscriptions.len();
            data.subscriptions.retain(|s| s.id != id && s.name != id);
            if data.subscriptions.len() == before {
                return Response::Error(format!("subscription '{id}' not found"));
            }
            match subscriptions_storage::save_subscriptions(&data) {
                Ok(()) => Response::Ok(serde_json::json!({"removed": id})),
                Err(e) => Response::Error(e),
            }
        }
        Command::UpdateSubscription { id } => {
            use calamity_core::singbox::{
                nodes_storage,
                subscription_fetch::fetch_subscription,
                subscriptions_storage,
            };
            let mut subs_data = subscriptions_storage::load_subscriptions();
            let mut nodes_data = nodes_storage::load_nodes();
            let mut updated = 0u32;

            for sub in &mut subs_data.subscriptions {
                if !sub.enabled {
                    continue;
                }
                if let Some(ref target_id) = id {
                    if &sub.id != target_id {
                        continue;
                    }
                }
                match fetch_subscription(&sub.url).await {
                    Ok(result) => {
                        // Find or create the group for this subscription
                        let group = nodes_data.groups.iter_mut().find(|g| g.id == sub.group_id);
                        if let Some(group) = group {
                            group.nodes = result.nodes.clone();
                        } else {
                            nodes_data.groups.push(nodes_storage::NodeGroup {
                                id: sub.group_id.clone(),
                                name: sub.name.clone(),
                                group_type: "select".to_string(),
                                nodes: result.nodes.clone(),
                            });
                        }
                        sub.node_count = result.nodes.len() as u32;
                        sub.last_updated = Some(chrono::Utc::now().to_rfc3339());
                        if let Some(info) = &result.user_info {
                            sub.traffic_upload = info.upload;
                            sub.traffic_download = info.download;
                            sub.traffic_total = info.total;
                            sub.expire = info.expire.clone();
                        }
                        updated += 1;
                    }
                    Err(e) => {
                        log::error!("failed to update subscription '{}': {e}", sub.name);
                    }
                }
            }

            if let Err(e) = nodes_storage::save_nodes(&nodes_data) {
                return Response::Error(e);
            }
            if let Err(e) = subscriptions_storage::save_subscriptions(&subs_data) {
                return Response::Error(e);
            }

            // Reload sing-box if running
            let s = state.lock().await;
            let settings = storage::load_settings();
            let _ = s.process.reload(&settings).await;

            Response::Ok(serde_json::json!({"updated": updated}))
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
        Command::GetDnsServers => {
            let dns = calamity_core::singbox::dns_storage::load_dns_settings();
            Response::Ok(serde_json::to_value(&dns).unwrap_or_default())
        }
        Command::SetDnsMode { mode } => {
            use calamity_core::singbox::dns_storage;
            let mut dns = dns_storage::load_dns_settings();
            dns.mode = serde_json::from_value(serde_json::Value::String(mode.clone()))
                .unwrap_or_default();
            match dns_storage::save_dns_settings(&dns) {
                Ok(()) => {
                    let s = state.lock().await;
                    let settings = storage::load_settings();
                    let _ = s.process.reload(&settings).await;
                    Response::Ok(serde_json::json!({"mode": mode}))
                }
                Err(e) => Response::Error(e),
            }
        }
        Command::SetFakeIpRange { range } => {
            use calamity_core::singbox::dns_storage;
            let mut dns = dns_storage::load_dns_settings();
            dns.fake_ip_range = range.clone();
            match dns_storage::save_dns_settings(&dns) {
                Ok(()) => Response::Ok(serde_json::json!({"fakeIpRange": range})),
                Err(e) => Response::Error(e),
            }
        }
        Command::AddDnsServer { name, address, detour, domain_resolver } => {
            use calamity_core::singbox::dns_storage::{self, DnsServerConfig};
            let mut dns = dns_storage::load_dns_settings();
            dns.servers.push(DnsServerConfig {
                id: None,
                name: name.clone(),
                address,
                enabled: true,
                detour,
                domain_resolver,
            });
            match dns_storage::save_dns_settings(&dns) {
                Ok(()) => Response::Ok(serde_json::json!({"added": name})),
                Err(e) => Response::Error(e),
            }
        }
        Command::RemoveDnsServer { name } => {
            use calamity_core::singbox::dns_storage;
            let mut dns = dns_storage::load_dns_settings();
            let before = dns.servers.len();
            dns.servers.retain(|s| s.name != name);
            if dns.servers.len() == before {
                return Response::Error(format!("DNS server '{name}' not found"));
            }
            match dns_storage::save_dns_settings(&dns) {
                Ok(()) => Response::Ok(serde_json::json!({"removed": name})),
                Err(e) => Response::Error(e),
            }
        }
        Command::AddDnsRule { match_type, match_value, server } => {
            use calamity_core::singbox::dns_storage::{self, DnsRuleConfig};
            let mut dns = dns_storage::load_dns_settings();
            dns.rules.push(DnsRuleConfig {
                id: None,
                match_type,
                match_value: match_value.clone(),
                server,
                enabled: true,
            });
            match dns_storage::save_dns_settings(&dns) {
                Ok(()) => Response::Ok(serde_json::json!({"added": match_value})),
                Err(e) => Response::Error(e),
            }
        }
        Command::RemoveDnsRule { match_value } => {
            use calamity_core::singbox::dns_storage;
            let mut dns = dns_storage::load_dns_settings();
            let before = dns.rules.len();
            dns.rules.retain(|r| r.match_value != match_value);
            if dns.rules.len() == before {
                return Response::Error(format!("DNS rule '{match_value}' not found"));
            }
            match dns_storage::save_dns_settings(&dns) {
                Ok(()) => Response::Ok(serde_json::json!({"removed": match_value})),
                Err(e) => Response::Error(e),
            }
        }
        Command::SetDnsFinal { server } => {
            use calamity_core::singbox::dns_storage;
            let mut dns = dns_storage::load_dns_settings();
            dns.final_server = server.clone();
            match dns_storage::save_dns_settings(&dns) {
                Ok(()) => Response::Ok(serde_json::json!({"final": server})),
                Err(e) => Response::Error(e),
            }
        }
        Command::BgpGetSettings => {
            let settings = bgp_storage::load_bgp_settings();
            Response::Ok(serde_json::to_value(&settings).unwrap_or_default())
        }
        Command::BgpAddPeer { name, address } => {
            let mut settings = bgp_storage::load_bgp_settings();
            settings.peers.push(bgp_storage::BgpPeer {
                id: uuid::Uuid::new_v4().to_string(),
                name: name.clone(),
                address,
                auto_discovered: false,
            });
            match bgp_storage::save_bgp_settings(&settings) {
                Ok(()) => Response::Ok(serde_json::json!({"added": name})),
                Err(e) => Response::Error(e),
            }
        }
        Command::BgpRemovePeer { id } => {
            let mut settings = bgp_storage::load_bgp_settings();
            let before = settings.peers.len();
            settings.peers.retain(|p| p.id != id && p.name != id);
            if settings.peers.len() == before {
                return Response::Error(format!("peer '{id}' not found"));
            }
            match bgp_storage::save_bgp_settings(&settings) {
                Ok(()) => Response::Ok(serde_json::json!({"removed": id})),
                Err(e) => Response::Error(e),
            }
        }
        Command::BgpPullRules { peer_addr } => {
            use calamity_core::singbox::{
                dns_storage, nodes_storage,
                subscription_fetch::parse_v2ray_uri,
            };

            let router_id = speaker::get_router_id();
            let result = match fsm::pull_rules(&peer_addr, router_id).await {
                Ok(r) => r,
                Err(e) => return Response::Error(e),
            };

            // Apply rules
            if let Err(e) = rules_storage::save_rules(&result.remote_rules) {
                return Response::Error(format!("save rules: {e}"));
            }
            let rules_count = result.remote_rules.rules.len();

            // Apply DNS
            let dns_count = if let Some(dns) = &result.remote_dns {
                let count = dns.servers.len();
                if let Err(e) = dns_storage::save_dns_settings(dns) {
                    return Response::Error(format!("save dns: {e}"));
                }
                count
            } else {
                0
            };

            // Apply nodes from URIs (format: "group_name\turi")
            let mut nodes_data = nodes_storage::load_nodes();
            // Clear existing groups and rebuild from remote
            nodes_data.groups.clear();
            let mut added_nodes = 0u32;
            for entry in &result.node_uris {
                let (group_name, uri) = match entry.split_once('\t') {
                    Some((g, u)) => (g, u),
                    None => ("Proxy", entry.as_str()),
                };
                if let Some(node) = parse_v2ray_uri(uri) {
                    // Find or create group
                    let group = nodes_data.groups.iter_mut().find(|g| g.name == group_name);
                    if let Some(group) = group {
                        group.nodes.push(node);
                    } else {
                        nodes_data.groups.push(nodes_storage::NodeGroup {
                            id: group_name.to_lowercase().replace(' ', "-"),
                            name: group_name.to_string(),
                            group_type: "select".to_string(),
                            nodes: vec![node],
                        });
                    }
                    added_nodes += 1;
                }
            }
            if added_nodes > 0 {
                if let Err(e) = nodes_storage::save_nodes(&nodes_data) {
                    return Response::Error(format!("save nodes: {e}"));
                }
            }

            // Reload sing-box
            let s = state.lock().await;
            let settings = storage::load_settings();
            let _ = s.process.reload(&settings).await;

            Response::Ok(serde_json::json!({
                "rules": rules_count,
                "dnsServers": dns_count,
                "nodesAdded": added_nodes,
            }))
        }
        Command::BgpApplyRules { .. } => {
            // Pull now auto-applies, this is kept for backward compat
            Response::Ok(serde_json::json!("use bgp pull instead"))
        }
        Command::BgpStartSync { peer_id } => {
            let bgp_settings = bgp_storage::load_bgp_settings();
            let peer = bgp_settings.peers.iter().find(|p| p.id == peer_id || p.name == peer_id);
            let peer = match peer {
                Some(p) => p.clone(),
                None => return Response::Error(format!("peer '{peer_id}' not found")),
            };
            let router_id = speaker::get_router_id();
            let reload_state = state.clone();
            let on_applied: std::sync::Arc<dyn Fn() + Send + Sync> = std::sync::Arc::new(move || {
                let st = reload_state.clone();
                tokio::spawn(async move {
                    let s = st.lock().await;
                    let settings = storage::load_settings();
                    let _ = s.process.reload(&settings).await;
                });
            });
            match SyncSession::start(peer.address.clone(), router_id, on_applied).await {
                Ok(session) => {
                    let mut s = state.lock().await;
                    // Stop previous session if any
                    if let Some(prev) = s.sync_session.take() {
                        prev.stop();
                    }
                    s.sync_session = Some(session);
                    // Save active_peer
                    let mut settings = bgp_storage::load_bgp_settings();
                    settings.active_peer = Some(peer.id.clone());
                    let _ = bgp_storage::save_bgp_settings(&settings);
                    Response::Ok(serde_json::json!({"syncing": peer.address}))
                }
                Err(e) => Response::Error(format!("start sync: {e}")),
            }
        }
        Command::BgpStopSync => {
            let mut s = state.lock().await;
            if let Some(session) = s.sync_session.take() {
                session.stop();
                // Clear active_peer
                let mut settings = bgp_storage::load_bgp_settings();
                settings.active_peer = None;
                let _ = bgp_storage::save_bgp_settings(&settings);
                Response::Ok(serde_json::json!("stopped"))
            } else {
                Response::Ok(serde_json::json!("no active sync"))
            }
        }
        Command::BgpSyncStatus => {
            let s = state.lock().await;
            if let Some(ref session) = s.sync_session {
                let status = session.status().await;
                Response::Ok(serde_json::to_value(&status).unwrap_or_default())
            } else {
                Response::Ok(serde_json::json!("disconnected"))
            }
        }
        Command::BgpDiscoverPeers => {
            // Try local Tailscale API first (Linux with tailscaled installed)
            match discover_via_local_tailscale().await {
                Ok(peers) => Response::Ok(serde_json::json!(peers)),
                Err(_) => {
                    // Fall back to OAuth API
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

/// Discover peers via local Tailscale daemon socket (/var/run/tailscale/tailscaled.sock).
async fn discover_via_local_tailscale() -> Result<Vec<serde_json::Value>, String> {
    use tokio::net::UnixStream;
    use tokio::io::{AsyncWriteExt, AsyncReadExt};

    let sock_path = "/var/run/tailscale/tailscaled.sock";
    let mut stream = UnixStream::connect(sock_path)
        .await
        .map_err(|e| format!("connect to tailscaled: {e}"))?;

    // HTTP request over Unix socket
    let request = "GET /localapi/v0/status HTTP/1.0\r\nHost: local-tailscaled.sock\r\n\r\n";
    stream.write_all(request.as_bytes()).await.map_err(|e| format!("write: {e}"))?;

    let mut response = Vec::new();
    stream.read_to_end(&mut response).await.map_err(|e| format!("read: {e}"))?;
    let text = String::from_utf8_lossy(&response);

    // Skip HTTP headers
    let body = text.split("\r\n\r\n").nth(1)
        .ok_or("no HTTP body")?;

    let status: serde_json::Value = serde_json::from_str(body)
        .map_err(|e| format!("parse status: {e}"))?;

    let self_ip = status["TailscaleIPs"].as_array()
        .and_then(|ips| ips.first())
        .and_then(|ip| ip.as_str())
        .unwrap_or("");

    let mut peers = Vec::new();
    if let Some(peer_map) = status["Peer"].as_object() {
        for (_key, peer) in peer_map {
            let hostname = peer["HostName"].as_str().unwrap_or("");
            let dns_name = peer["DNSName"].as_str().unwrap_or("");
            let online = peer["Online"].as_bool().unwrap_or(false);
            let ip = peer["TailscaleIPs"].as_array()
                .and_then(|ips| ips.first())
                .and_then(|ip| ip.as_str())
                .unwrap_or("");

            if online && !ip.is_empty() && ip != self_ip {
                let display_name = dns_name.split('.').next().unwrap_or(hostname);
                peers.push(serde_json::json!({
                    "name": display_name,
                    "hostname": hostname,
                    "address": ip,
                }));
            }
        }
    }

    Ok(peers)
}

async fn wait_for_sigterm() {
    use tokio::signal::unix::{signal, SignalKind};
    let mut sigterm = signal(SignalKind::terminate()).expect("failed to register SIGTERM");
    sigterm.recv().await;
}
