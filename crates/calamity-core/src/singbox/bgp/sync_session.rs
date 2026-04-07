use std::collections::{HashMap, HashSet};
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

/// Metadata marker keys that should always be sent and never treated as withdrawals.
const METADATA_KEYS: &[&[u8]] = &[b"__META__", b"__DNSM__"];

fn is_metadata_key(key: &[u8]) -> bool {
    METADATA_KEYS.iter().any(|m| *m == key)
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

/// Compute incremental update between previous and current entry sets.
/// Returns only changed/new entries plus withdrawal markers for removed keys.
/// Metadata entries (__META__, __DNSM__) are always included.
/// Returns empty vec if nothing changed.
pub fn compute_incremental_update(
    prev: &[(Vec<u8>, Vec<u8>)],
    current: &[(Vec<u8>, Vec<u8>)],
) -> Vec<(Vec<u8>, Vec<u8>)> {
    let prev_map: HashMap<&[u8], &[u8]> = prev.iter().map(|(k, v)| (k.as_slice(), v.as_slice())).collect();
    let current_map: HashMap<&[u8], &[u8]> = current.iter().map(|(k, v)| (k.as_slice(), v.as_slice())).collect();

    let mut incremental = Vec::new();

    // Always include metadata entries from current
    for (key, payload) in current {
        if is_metadata_key(key) {
            incremental.push((key.clone(), payload.clone()));
        }
    }

    // Additions and modifications (skip metadata, already added)
    for (key, payload) in current {
        if is_metadata_key(key) {
            continue;
        }
        match prev_map.get(key.as_slice()) {
            None => {
                // New entry
                incremental.push((key.clone(), payload.clone()));
            }
            Some(old_payload) => {
                if *old_payload != payload.as_slice() {
                    // Modified entry
                    incremental.push((key.clone(), payload.clone()));
                }
            }
        }
    }

    // Withdrawals: keys in prev but not in current (skip metadata)
    for (key, _) in prev {
        if is_metadata_key(key) {
            continue;
        }
        if !current_map.contains_key(key.as_slice()) {
            incremental.push(codec::encode_withdrawal(key));
        }
    }

    // Check if anything actually changed beyond metadata
    let non_metadata_count = incremental.iter().filter(|(k, _)| !is_metadata_key(k)).count();
    if non_metadata_count == 0 {
        // Check if metadata itself changed
        let metadata_changed = incremental.iter().any(|(k, v)| {
            if is_metadata_key(k) {
                prev_map.get(k.as_slice()).map_or(true, |old| *old != v.as_slice())
            } else {
                false
            }
        });
        if !metadata_changed {
            return Vec::new();
        }
    }

    incremental
}

/// Merge remote sync data into local storage using union semantics.
/// - For withdrawn keys: remove matching rules/DNS/nodes from local storage
/// - For additions: add entries that only remote has (same name -> keep local)
fn merge_remote_data(data: &SyncData) {
    // --- Process withdrawals ---
    if !data.withdrawn_keys.is_empty() {
        let mut local_rules = rules_storage::load_rules();
        let mut local_dns = dns_storage::load_dns_settings();
        let mut local_nodes = nodes_storage::load_nodes();
        let mut rules_changed = false;
        let mut dns_changed = false;
        let mut nodes_changed = false;

        for wkey in &data.withdrawn_keys {
            let key_str = String::from_utf8_lossy(wkey);

            // Check if it's a DNS server marker key
            if wkey.as_slice() == b"__DNSS__" {
                // DNS server withdrawals are handled via the payload, skip marker
                continue;
            }
            // Check if it's a DNS rule marker key
            if wkey.as_slice() == b"__DNSR__" {
                continue;
            }
            // Check if it's a node marker key
            if wkey.as_slice() == b"__NODE__" {
                continue;
            }

            // Try as rule ID
            let before_len = local_rules.rules.len();
            local_rules.rules.retain(|r| r.id != key_str.as_ref());
            if local_rules.rules.len() < before_len {
                rules_changed = true;
                continue;
            }

            // Try as DNS server name
            let before_dns_servers = local_dns.servers.len();
            local_dns.servers.retain(|s| s.name != key_str.as_ref());
            if local_dns.servers.len() < before_dns_servers {
                dns_changed = true;
                continue;
            }

            // Try as DNS rule key (match_type:match_value)
            let before_dns_rules = local_dns.rules.len();
            local_dns.rules.retain(|r| {
                format!("{}:{}", r.match_type, r.match_value) != key_str.as_ref()
            });
            if local_dns.rules.len() < before_dns_rules {
                dns_changed = true;
                continue;
            }

            // Try as node URI
            for group in &mut local_nodes.groups {
                let before_nodes = group.nodes.len();
                group.nodes.retain(|n| {
                    node_to_uri(n).map_or(true, |uri| {
                        let full = format!("{}\t{}", group.name, uri);
                        full != key_str.as_ref()
                    })
                });
                if group.nodes.len() < before_nodes {
                    nodes_changed = true;
                }
            }
        }

        if rules_changed {
            let _ = rules_storage::save_rules(&local_rules);
            eprintln!("[bgp-sync] withdrew rules via explicit withdrawal");
        }
        if dns_changed {
            let _ = dns_storage::save_dns_settings(&local_dns);
            eprintln!("[bgp-sync] withdrew DNS entries via explicit withdrawal");
        }
        if nodes_changed {
            let _ = nodes_storage::save_nodes(&local_nodes);
            eprintln!("[bgp-sync] withdrew nodes via explicit withdrawal");
        }
    }

    // --- Merge route rules (additions) ---
    let mut local_rules = rules_storage::load_rules();
    let local_rule_names: HashSet<String> =
        local_rules.rules.iter().map(|r| r.name.clone()).collect();

    let mut rules_added = false;
    for rule in &data.rules.rules {
        if !local_rule_names.contains(&rule.name) {
            local_rules.rules.push(rule.clone());
            rules_added = true;
        }
    }

    // Merge metadata (final_outbound) -- keep local unless local is default
    if local_rules.final_outbound.is_empty() || local_rules.final_outbound == "proxy" {
        local_rules.final_outbound = data.rules.final_outbound.clone();
        local_rules.final_outbound_node = data.rules.final_outbound_node.clone();
    }

    if rules_added {
        let _ = rules_storage::save_rules(&local_rules);
    }

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

    // Send our data first (full initial sync)
    let local_entries = collect_local_data();
    stream
        .write_all(&fsm::build_update(&local_entries))
        .await
        .map_err(|e| format!("send initial UPDATE: {e}"))?;

    // Track last sent for incremental updates
    let mut last_sent = local_entries;

    *status.lock().await = SyncStatus::Synced;

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
                                "[bgp-sync] received {} rules, {} DNS servers, {} nodes, {} withdrawals",
                                sync_data.rules.rules.len(),
                                sync_data.dns.as_ref().map_or(0, |d| d.servers.len()),
                                sync_data.node_uris.len(),
                                sync_data.withdrawn_keys.len()
                            );
                            merge_remote_data(&sync_data);
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

                let current = collect_local_data();
                let incremental = compute_incremental_update(&last_sent, &current);
                if !incremental.is_empty() {
                    stream.write_all(&fsm::build_update(&incremental)).await
                        .map_err(|e| format!("send UPDATE: {e}"))?;
                    eprintln!("[bgp-sync] pushed incremental update ({} entries) to {peer_addr}", incremental.len());
                }
                last_sent = current;
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

    #[test]
    fn incremental_no_changes() {
        let entries = vec![
            (b"__META__".to_vec(), b"payload".to_vec()),
            (b"rule1".to_vec(), b"data1".to_vec()),
        ];
        let result = compute_incremental_update(&entries, &entries);
        assert!(result.is_empty());
    }

    #[test]
    fn incremental_detects_addition() {
        let prev = vec![
            (b"__META__".to_vec(), b"meta".to_vec()),
            (b"rule1".to_vec(), b"data1".to_vec()),
        ];
        let current = vec![
            (b"__META__".to_vec(), b"meta".to_vec()),
            (b"rule1".to_vec(), b"data1".to_vec()),
            (b"rule2".to_vec(), b"data2".to_vec()),
        ];
        let result = compute_incremental_update(&prev, &current);
        assert!(!result.is_empty());
        // Should contain metadata + the new rule
        let non_meta: Vec<_> = result.iter().filter(|(k, _)| !is_metadata_key(k)).collect();
        assert_eq!(non_meta.len(), 1);
        assert_eq!(non_meta[0].0, b"rule2");
    }

    #[test]
    fn incremental_detects_removal() {
        let prev = vec![
            (b"__META__".to_vec(), b"meta".to_vec()),
            (b"rule1".to_vec(), b"data1".to_vec()),
            (b"rule2".to_vec(), b"data2".to_vec()),
        ];
        let current = vec![
            (b"__META__".to_vec(), b"meta".to_vec()),
            (b"rule1".to_vec(), b"data1".to_vec()),
        ];
        let result = compute_incremental_update(&prev, &current);
        assert!(!result.is_empty());
        // Should contain withdrawal for rule2
        let withdrawals: Vec<_> = result.iter().filter(|(k, _)| k == codec::WITHDRAW_MARKER).collect();
        assert_eq!(withdrawals.len(), 1);
        assert_eq!(withdrawals[0].1, b"rule2");
    }

    #[test]
    fn incremental_detects_modification() {
        let prev = vec![
            (b"__META__".to_vec(), b"meta".to_vec()),
            (b"rule1".to_vec(), b"data1".to_vec()),
        ];
        let current = vec![
            (b"__META__".to_vec(), b"meta".to_vec()),
            (b"rule1".to_vec(), b"data1_modified".to_vec()),
        ];
        let result = compute_incremental_update(&prev, &current);
        assert!(!result.is_empty());
        let non_meta: Vec<_> = result.iter().filter(|(k, _)| !is_metadata_key(k)).collect();
        assert_eq!(non_meta.len(), 1);
        assert_eq!(non_meta[0].0, b"rule1");
        assert_eq!(non_meta[0].1, b"data1_modified");
    }
}
