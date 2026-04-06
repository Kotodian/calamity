use std::collections::HashSet;
use std::sync::Arc;
use std::time::Duration;
use tokio::io::AsyncWriteExt;
use tokio::net::TcpStream;
use tokio::sync::{mpsc, watch, Mutex};

use super::codec::{self, SyncData};
use super::fsm;
use crate::singbox::{dns_storage, nodes_storage, rules_storage, subscription_fetch::node_to_uri};

/// Current state of the sync session, exposed to UI.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum SyncStatus {
    Disconnected,
    Connecting,
    Synced,
    Reconnecting { attempt: u32 },
}

/// Handle to a running sync session. Call `stop()` to disconnect.
pub struct SyncSession {
    shutdown_tx: watch::Sender<bool>,
    status: Arc<Mutex<SyncStatus>>,
}

/// Callback invoked when remote data is received and merged.
/// The callback receives the merged SyncData and should reload sing-box.
pub type OnSyncApplied = Arc<dyn Fn() + Send + Sync>;

impl SyncSession {
    /// Start a persistent sync session with the given peer.
    pub async fn start(
        peer_addr: String,
        local_router_id: [u8; 4],
        on_sync_applied: OnSyncApplied,
    ) -> Result<Self, String> {
        let (shutdown_tx, shutdown_rx) = watch::channel(false);
        let status = Arc::new(Mutex::new(SyncStatus::Connecting));
        let status_clone = status.clone();

        tokio::spawn(async move {
            run_session_loop(
                peer_addr,
                local_router_id,
                shutdown_rx,
                status_clone,
                on_sync_applied,
            )
            .await;
        });

        Ok(Self {
            shutdown_tx,
            status,
        })
    }

    pub fn stop(&self) {
        let _ = self.shutdown_tx.send(true);
    }

    pub async fn status(&self) -> SyncStatus {
        self.status.lock().await.clone()
    }
}

/// Backoff: min(2^attempt * 1000 + jitter, 60000) ms
fn backoff_duration(attempt: u32) -> Duration {
    let base = 1000u64.saturating_mul(1u64.checked_shl(attempt).unwrap_or(u64::MAX));
    let jitter = rand_jitter();
    let ms = base.saturating_add(jitter).min(60_000);
    Duration::from_millis(ms)
}

fn rand_jitter() -> u64 {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .subsec_nanos();
    (nanos % 1000) as u64
}

/// Collect current local sync data for pushing to peer.
pub fn collect_local_data() -> Vec<(Vec<u8>, Vec<u8>)> {
    let rules_data = rules_storage::load_rules();
    let syncable = codec::filter_syncable_rules(&rules_data);
    let dns_data = dns_storage::load_dns_settings();
    let nodes_data = nodes_storage::load_nodes();
    let node_uris: Vec<String> = nodes_data
        .groups
        .iter()
        .flat_map(|g| {
            g.nodes
                .iter()
                .filter_map(move |n| node_to_uri(n).map(|uri| format!("{}\t{}", g.name, uri)))
        })
        .collect();
    codec::encode_sync_data(&syncable, Some(&dns_data), &node_uris)
}

/// Merge remote sync data into local storage using union semantics.
/// - Rules/DNS servers/DNS rules/nodes that only remote has -> add to local
/// - Same name -> keep local version
/// - Rules in `prev_remote_names` that are NOT in current remote -> remove from local (WITHDRAW)
/// Returns updated set of remote rule names for next comparison.
fn merge_remote_data(data: &SyncData, prev_remote_rule_names: &HashSet<String>) -> HashSet<String> {
    // --- Merge route rules ---
    let mut local_rules = rules_storage::load_rules();
    let local_rule_names: HashSet<String> =
        local_rules.rules.iter().map(|r| r.name.clone()).collect();
    let remote_rule_names: HashSet<String> =
        data.rules.rules.iter().map(|r| r.name.clone()).collect();

    // Add rules that remote has but local doesn't
    for rule in &data.rules.rules {
        if !local_rule_names.contains(&rule.name) {
            local_rules.rules.push(rule.clone());
        }
    }

    // Withdraw: rules that were previously from remote but are now gone
    let withdrawn: HashSet<&String> = prev_remote_rule_names
        .difference(&remote_rule_names)
        .collect();
    if !withdrawn.is_empty() {
        local_rules.rules.retain(|r| !withdrawn.contains(&r.name));
        eprintln!("[bgp-sync] withdrew {} rules", withdrawn.len());
    }

    // Merge metadata (final_outbound) -- keep local unless local is default
    if local_rules.final_outbound.is_empty() || local_rules.final_outbound == "proxy" {
        local_rules.final_outbound = data.rules.final_outbound.clone();
        local_rules.final_outbound_node = data.rules.final_outbound_node.clone();
    }

    let _ = rules_storage::save_rules(&local_rules);

    // --- Merge DNS ---
    if let Some(ref remote_dns) = data.dns {
        let mut local_dns = dns_storage::load_dns_settings();
        let local_server_names: HashSet<String> =
            local_dns.servers.iter().map(|s| s.name.clone()).collect();
        for server in &remote_dns.servers {
            if !local_server_names.contains(&server.name) {
                local_dns.servers.push(server.clone());
            }
        }
        let local_dns_rule_keys: HashSet<String> = local_dns
            .rules
            .iter()
            .map(|r| format!("{}:{}", r.match_type, r.match_value))
            .collect();
        for rule in &remote_dns.rules {
            let key = format!("{}:{}", rule.match_type, rule.match_value);
            if !local_dns_rule_keys.contains(&key) {
                local_dns.rules.push(rule.clone());
            }
        }
        let _ = dns_storage::save_dns_settings(&local_dns);
    }

    // --- Merge nodes ---
    if !data.node_uris.is_empty() {
        let mut nodes_data = nodes_storage::load_nodes();
        for uri_line in &data.node_uris {
            if let Some((group_name, uri)) = uri_line.split_once('\t') {
                if let Some(node) = crate::singbox::subscription_fetch::parse_v2ray_uri(uri) {
                    let group = nodes_data
                        .groups
                        .iter_mut()
                        .find(|g| g.name == group_name);
                    if let Some(group) = group {
                        if !group.nodes.iter().any(|n| n.name == node.name) {
                            group.nodes.push(node);
                        }
                    } else {
                        nodes_data.groups.push(nodes_storage::NodeGroup {
                            id: uuid::Uuid::new_v4().to_string(),
                            name: group_name.to_string(),
                            group_type: "select".to_string(),
                            nodes: vec![node],
                        });
                    }
                }
            }
        }
        let _ = nodes_storage::save_nodes(&nodes_data);
    }

    remote_rule_names
}

/// Set up a file watcher on the data directory.
fn watch_data_files(tx: mpsc::Sender<()>) -> Result<notify::RecommendedWatcher, String> {
    use notify::{Event, EventKind, RecursiveMode, Watcher};

    let relevant_files: HashSet<&str> = ["rules.json", "dns.json", "nodes.json", "subscriptions.json"]
        .into_iter()
        .collect();

    let mut watcher = notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
        if let Ok(event) = res {
            if matches!(event.kind, EventKind::Modify(_) | EventKind::Create(_)) {
                let dominated = event.paths.iter().any(|p| {
                    p.file_name()
                        .and_then(|n| n.to_str())
                        .is_some_and(|n| relevant_files.contains(n))
                });
                if dominated {
                    let _ = tx.try_send(());
                }
            }
        }
    })
    .map_err(|e| format!("watcher init failed: {e}"))?;

    let data_dir = crate::singbox::storage::app_data_dir();
    watcher
        .watch(&data_dir, RecursiveMode::NonRecursive)
        .map_err(|e| format!("watch failed: {e}"))?;

    Ok(watcher)
}

/// Main session loop with reconnect.
async fn run_session_loop(
    peer_addr: String,
    local_router_id: [u8; 4],
    mut shutdown_rx: watch::Receiver<bool>,
    status: Arc<Mutex<SyncStatus>>,
    on_sync_applied: OnSyncApplied,
) {
    let mut attempt: u32 = 0;

    loop {
        if *shutdown_rx.borrow() {
            *status.lock().await = SyncStatus::Disconnected;
            return;
        }

        if attempt > 0 {
            *status.lock().await = SyncStatus::Reconnecting { attempt };
            let delay = backoff_duration(attempt);
            eprintln!(
                "[bgp-sync] reconnecting in {}ms (attempt {})",
                delay.as_millis(),
                attempt
            );
            tokio::select! {
                _ = tokio::time::sleep(delay) => {}
                _ = shutdown_rx.changed() => {
                    *status.lock().await = SyncStatus::Disconnected;
                    return;
                }
            }
        }

        *status.lock().await = SyncStatus::Connecting;

        match connect_and_sync(
            &peer_addr,
            local_router_id,
            &mut shutdown_rx,
            &status,
            &on_sync_applied,
        )
        .await
        {
            Ok(()) => {
                *status.lock().await = SyncStatus::Disconnected;
                return;
            }
            Err(e) => {
                eprintln!("[bgp-sync] session error: {e}");
                attempt = attempt.saturating_add(1);
            }
        }
    }
}

/// Single connection: handshake, initial sync, then bidirectional loop.
async fn connect_and_sync(
    peer_addr: &str,
    local_router_id: [u8; 4],
    shutdown_rx: &mut watch::Receiver<bool>,
    status: &Arc<Mutex<SyncStatus>>,
    on_sync_applied: &OnSyncApplied,
) -> Result<(), String> {
    let addr: std::net::SocketAddr = format!("{peer_addr}:17900")
        .parse()
        .map_err(|e| format!("invalid address: {e}"))?;

    let mut stream = tokio::time::timeout(Duration::from_secs(10), TcpStream::connect(addr))
        .await
        .map_err(|_| "connection timeout".to_string())?
        .map_err(|e| format!("connect failed: {e}"))?;

    fsm::handshake_client(&mut stream, local_router_id).await?;
    eprintln!("[bgp-sync] session established with {peer_addr}");

    // Send our data first
    let local_entries = collect_local_data();
    stream
        .write_all(&fsm::build_update(&local_entries))
        .await
        .map_err(|e| format!("send initial UPDATE: {e}"))?;

    *status.lock().await = SyncStatus::Synced;

    // Track remote rule names for WITHDRAW detection
    let mut prev_remote_rule_names: HashSet<String> = HashSet::new();

    // File watcher for local changes
    let (file_tx, mut file_rx) = mpsc::channel::<()>(1);
    let _watcher = watch_data_files(file_tx)?;

    // Keepalive timer
    let keepalive_interval = Duration::from_secs(20);
    let mut keepalive_timer = tokio::time::interval(keepalive_interval);
    keepalive_timer.tick().await;

    let read_timeout = Duration::from_secs(90);

    loop {
        tokio::select! {
            _ = shutdown_rx.changed() => {
                if *shutdown_rx.borrow() {
                    let _ = stream.shutdown().await;
                    return Ok(());
                }
            }
            read_result = tokio::time::timeout(read_timeout, fsm::read_message(&mut stream)) => {
                match read_result {
                    Ok(Ok((fsm::MSG_UPDATE, body))) => {
                        let entries = fsm::parse_update_entries(&body)?;
                        if !entries.is_empty() {
                            let sync_data = codec::decode_sync_data(&entries)?;
                            eprintln!(
                                "[bgp-sync] received {} rules, {} DNS servers, {} nodes",
                                sync_data.rules.rules.len(),
                                sync_data.dns.as_ref().map_or(0, |d| d.servers.len()),
                                sync_data.node_uris.len()
                            );
                            prev_remote_rule_names = merge_remote_data(&sync_data, &prev_remote_rule_names);
                            on_sync_applied();
                        }
                    }
                    Ok(Ok((fsm::MSG_KEEPALIVE, _))) => {}
                    Ok(Ok((fsm::MSG_NOTIFICATION, body))) => {
                        let code = body.first().copied().unwrap_or(0);
                        return Err(format!("peer NOTIFICATION: code={code}"));
                    }
                    Ok(Ok(_)) => {}
                    Ok(Err(e)) => return Err(format!("read error: {e}")),
                    Err(_) => return Err("peer timeout (no message in 90s)".to_string()),
                }
            }
            _ = file_rx.recv() => {
                // Debounce
                tokio::time::sleep(Duration::from_millis(500)).await;
                while file_rx.try_recv().is_ok() {}

                let entries = collect_local_data();
                stream.write_all(&fsm::build_update(&entries)).await
                    .map_err(|e| format!("send UPDATE: {e}"))?;
                eprintln!("[bgp-sync] pushed local changes to {peer_addr}");
            }
            _ = keepalive_timer.tick() => {
                stream.write_all(&fsm::build_keepalive()).await
                    .map_err(|e| format!("send KEEPALIVE: {e}"))?;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn backoff_increases() {
        let d0 = backoff_duration(0);
        let d1 = backoff_duration(1);
        let d5 = backoff_duration(5);
        assert!(d0 < d1);
        assert!(d1 < d5);
    }

    #[test]
    fn backoff_caps_at_60s() {
        let d = backoff_duration(20);
        assert!(d <= Duration::from_secs(60));
    }
}
