# BGP Persistent Bidirectional Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the one-shot BGP pull model with persistent bidirectional sync: select a peer, preview diff, confirm, then maintain a long-lived BGP session with automatic reconnect and real-time change propagation.

**Architecture:** Extend the existing BGP FSM to support long-lived sessions with bidirectional UPDATE messages. A new `SyncSession` manages connection lifecycle (connect, sync, keepalive, reconnect with exponential backoff + jitter). File watchers detect local changes and push UPDATEs. Peer discovery uses mDNS for LAN and port-probing for Tailscale. The UI shows sync status and allows selecting/deselecting a peer.

**Tech Stack:** Rust (tokio, notify for file watching, mdns-sd for mDNS), TypeScript/React (Zustand store, Tauri IPC)

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `crates/calamity-core/src/singbox/bgp/sync_session.rs` | Long-lived sync session: connect, bidirectional UPDATE, keepalive loop, backoff reconnect, file change watcher |
| `crates/calamity-core/src/singbox/bgp/discovery.rs` | Peer discovery: mDNS registration/browse + Tailscale port probe |

### Modified Files
| File | Changes |
|------|---------|
| `crates/calamity-core/src/singbox/bgp/mod.rs` | Add `pub mod sync_session; pub mod discovery;` |
| `crates/calamity-core/src/singbox/bgp/fsm.rs` | Make `build_open`, `build_keepalive`, `build_update`, `read_message`, `parse_update_entries` pub. Add `handshake_client()` and `handshake_server()`. Keep `serve_rules` but extend speaker to support long-lived sessions. |
| `crates/calamity-core/src/singbox/bgp/speaker.rs` | Extend to handle long-lived incoming sessions (not just one-shot serve) |
| `crates/calamity-core/src/singbox/bgp/storage.rs` | Add `active_peer: Option<String>` to `BgpSettings` |
| `crates/calamity-core/src/singbox/bgp/codec.rs` | No changes needed, encoding/decoding already complete |
| `crates/calamity-core/Cargo.toml` | Add `notify = "7"` and `mdns-sd = "0.11"` dependencies |
| `src-tauri/src/commands/bgp_sync.rs` | Add commands: `bgp_start_sync`, `bgp_stop_sync`, `bgp_sync_status`. Replace `bgp_discover_peers` with new discovery logic. |
| `crates/calamityd/src/main.rs` | Add IPC handlers for new sync commands, auto-resume sync on startup |
| `src/pages/BgpSyncPage.tsx` | Replace PULL button with sync toggle, show connection status |
| `src/stores/bgp-sync.ts` | Add sync state (syncing, syncStatus, activePeer), new actions |
| `src/services/bgp-sync.ts` | Add startSync, stopSync, getSyncStatus service methods |

---

### Task 1: Add dependencies and make FSM internals public

**Files:**
- Modify: `crates/calamity-core/Cargo.toml`
- Modify: `crates/calamity-core/src/singbox/bgp/fsm.rs`
- Modify: `crates/calamity-core/src/singbox/bgp/mod.rs`

- [ ] **Step 1: Add notify and mdns-sd to Cargo.toml**

In `crates/calamity-core/Cargo.toml`, add under `[dependencies]`:

```toml
notify = { version = "7", default-features = false, features = ["macos_kqueue"] }
mdns-sd = "0.11"
```

- [ ] **Step 2: Make FSM building blocks public**

In `crates/calamity-core/src/singbox/bgp/fsm.rs`, change visibility of these functions from `fn` to `pub fn`:

```rust
pub fn build_open(router_id: [u8; 4]) -> Vec<u8> { ... }
pub fn build_keepalive() -> Vec<u8> { ... }
pub fn build_update(entries: &[(Vec<u8>, Vec<u8>)]) -> Vec<u8> { ... }
pub fn parse_update_entries(update_body: &[u8]) -> Result<Vec<(Vec<u8>, Vec<u8>)>, String> { ... }
pub async fn read_message(stream: &mut TcpStream) -> Result<(u8, Vec<u8>), String> { ... }
```

Also make constants public:

```rust
pub const MSG_OPEN: u8 = 1;
pub const MSG_UPDATE: u8 = 2;
pub const MSG_NOTIFICATION: u8 = 3;
pub const MSG_KEEPALIVE: u8 = 4;
```

- [ ] **Step 3: Add handshake helpers to FSM**

Add two new public functions in `fsm.rs` that extract the handshake logic:

```rust
/// Perform client-side BGP handshake (send OPEN, receive OPEN, exchange KEEPALIVEs).
pub async fn handshake_client(stream: &mut TcpStream, local_router_id: [u8; 4]) -> Result<(), String> {
    stream.write_all(&build_open(local_router_id)).await.map_err(|e| format!("send OPEN: {e}"))?;
    let (msg_type, _) = read_message(stream).await?;
    if msg_type != MSG_OPEN {
        return Err(format!("expected OPEN, got type {msg_type}"));
    }
    stream.write_all(&build_keepalive()).await.map_err(|e| format!("send KEEPALIVE: {e}"))?;
    let (msg_type, _) = read_message(stream).await?;
    if msg_type != MSG_KEEPALIVE {
        return Err(format!("expected KEEPALIVE, got type {msg_type}"));
    }
    Ok(())
}

/// Perform server-side BGP handshake (receive OPEN, send OPEN + KEEPALIVE, receive KEEPALIVE).
pub async fn handshake_server(stream: &mut TcpStream, local_router_id: [u8; 4]) -> Result<(), String> {
    let (msg_type, _) = read_message(stream).await?;
    if msg_type != MSG_OPEN {
        return Err(format!("expected OPEN, got type {msg_type}"));
    }
    stream.write_all(&build_open(local_router_id)).await.map_err(|e| format!("send OPEN: {e}"))?;
    stream.write_all(&build_keepalive()).await.map_err(|e| format!("send KEEPALIVE: {e}"))?;
    let (msg_type, _) = read_message(stream).await?;
    if msg_type != MSG_KEEPALIVE {
        return Err(format!("expected KEEPALIVE, got type {msg_type}"));
    }
    Ok(())
}
```

- [ ] **Step 4: Update mod.rs**

```rust
pub mod codec;
pub mod discovery;
pub mod fsm;
pub mod speaker;
pub mod storage;
pub mod sync_session;
```

- [ ] **Step 5: Verify compilation**

Run: `cargo check -p calamity-core`
Expected: Compiles with no errors (warnings OK)

- [ ] **Step 6: Commit**

```bash
git add crates/calamity-core/Cargo.toml crates/calamity-core/src/singbox/bgp/fsm.rs crates/calamity-core/src/singbox/bgp/mod.rs
git commit -m "refactor(bgp): make FSM internals public, add handshake helpers, add deps"
```

---

### Task 2: Add `active_peer` to BGP storage

**Files:**
- Modify: `crates/calamity-core/src/singbox/bgp/storage.rs`
- Test: inline in `storage.rs`

- [ ] **Step 1: Write test for active_peer persistence**

Add to the `tests` module in `storage.rs`:

```rust
#[test]
fn active_peer_serialization() {
    let settings = BgpSettings {
        enabled: true,
        peers: vec![],
        active_peer: Some("peer-1".to_string()),
    };
    let json = serde_json::to_string(&settings).unwrap();
    assert!(json.contains("activePeer"));
    let deserialized: BgpSettings = serde_json::from_str(&json).unwrap();
    assert_eq!(deserialized.active_peer, Some("peer-1".to_string()));
}

#[test]
fn active_peer_defaults_to_none() {
    let json = r#"{"enabled": true, "peers": []}"#;
    let settings: BgpSettings = serde_json::from_str(json).unwrap();
    assert_eq!(settings.active_peer, None);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p calamity-core bgp::storage::tests::active_peer`
Expected: FAIL - no field `active_peer`

- [ ] **Step 3: Add active_peer field to BgpSettings**

In `storage.rs`, add to `BgpSettings`:

```rust
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct BgpSettings {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub peers: Vec<BgpPeer>,
    #[serde(default)]
    pub active_peer: Option<String>,
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test -p calamity-core bgp::storage`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add crates/calamity-core/src/singbox/bgp/storage.rs
git commit -m "feat(bgp): add active_peer field to BgpSettings"
```

---

### Task 3: Implement SyncSession

**Files:**
- Create: `crates/calamity-core/src/singbox/bgp/sync_session.rs`

- [ ] **Step 1: Write the SyncSession state machine**

Create `crates/calamity-core/src/singbox/bgp/sync_session.rs`:

```rust
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

/// Callback invoked when remote data is received.
pub type OnRemoteUpdate = Arc<dyn Fn(SyncData) + Send + Sync>;

impl SyncSession {
    /// Start a persistent sync session with the given peer.
    /// `on_remote_update` is called whenever the peer pushes new data.
    pub async fn start(
        peer_addr: String,
        local_router_id: [u8; 4],
        on_remote_update: OnRemoteUpdate,
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
                on_remote_update,
            )
            .await;
        });

        Ok(Self { shutdown_tx, status })
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
    let base = 1000u64.saturating_mul(1u64.saturating_shl(attempt));
    let jitter = rand_jitter();
    let ms = base.saturating_add(jitter).min(60_000);
    Duration::from_millis(ms)
}

fn rand_jitter() -> u64 {
    // Simple jitter using system time nanos
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .subsec_nanos();
    (nanos % 1000) as u64
}

/// Collect current local sync data for pushing to peer.
fn collect_local_data() -> Vec<(Vec<u8>, Vec<u8>)> {
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

/// Set up a file watcher on the data directory. Sends a signal when any
/// relevant JSON file changes (rules.json, dns.json, nodes.json, subscriptions.json).
fn watch_data_files(tx: mpsc::Sender<()>) -> Result<notify::RecommendedWatcher, String> {
    use notify::{Event, EventKind, RecursiveMode, Watcher};

    let relevant_files: std::collections::HashSet<&str> = [
        "rules.json",
        "dns.json",
        "nodes.json",
        "subscriptions.json",
    ]
    .into_iter()
    .collect();

    let mut watcher =
        notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
            if let Ok(event) = res {
                if matches!(
                    event.kind,
                    EventKind::Modify(_) | EventKind::Create(_)
                ) {
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

/// Main session loop: connect, sync, keepalive, react to local changes, reconnect on failure.
async fn run_session_loop(
    peer_addr: String,
    local_router_id: [u8; 4],
    mut shutdown_rx: watch::Receiver<bool>,
    status: Arc<Mutex<SyncStatus>>,
    on_remote_update: OnRemoteUpdate,
) {
    let mut attempt: u32 = 0;

    loop {
        // Check shutdown
        if *shutdown_rx.borrow() {
            *status.lock().await = SyncStatus::Disconnected;
            return;
        }

        if attempt > 0 {
            *status.lock().await = SyncStatus::Reconnecting { attempt };
            let delay = backoff_duration(attempt);
            eprintln!("[bgp-sync] reconnecting in {}ms (attempt {})", delay.as_millis(), attempt);
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
            &on_remote_update,
        )
        .await
        {
            Ok(()) => {
                // Clean shutdown requested
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

/// Single connection attempt: handshake, initial full sync, then bidirectional loop.
async fn connect_and_sync(
    peer_addr: &str,
    local_router_id: [u8; 4],
    shutdown_rx: &mut watch::Receiver<bool>,
    status: &Arc<Mutex<SyncStatus>>,
    on_remote_update: &OnRemoteUpdate,
) -> Result<(), String> {
    let addr: std::net::SocketAddr = format!("{peer_addr}:17900")
        .parse()
        .map_err(|e| format!("invalid address: {e}"))?;

    let mut stream = tokio::time::timeout(Duration::from_secs(10), TcpStream::connect(addr))
        .await
        .map_err(|_| "connection timeout".to_string())?
        .map_err(|e| format!("connect failed: {e}"))?;

    // Handshake
    fsm::handshake_client(&mut stream, local_router_id).await?;
    eprintln!("[bgp-sync] session established with {peer_addr}");

    // Send our data first
    let local_entries = collect_local_data();
    stream
        .write_all(&fsm::build_update(&local_entries))
        .await
        .map_err(|e| format!("send initial UPDATE: {e}"))?;

    *status.lock().await = SyncStatus::Synced;

    // Set up file watcher for local changes
    let (file_tx, mut file_rx) = mpsc::channel::<()>(1);
    let _watcher = watch_data_files(file_tx)?;

    // Keepalive timer
    let keepalive_interval = Duration::from_secs(20);
    let mut keepalive_timer = tokio::time::interval(keepalive_interval);
    keepalive_timer.tick().await; // consume first immediate tick

    // Read timeout for detecting dead connections
    let read_timeout = Duration::from_secs(90); // 1.5x hold_time

    loop {
        tokio::select! {
            // Shutdown requested
            _ = shutdown_rx.changed() => {
                if *shutdown_rx.borrow() {
                    let _ = stream.shutdown().await;
                    return Ok(());
                }
            }
            // Incoming message from peer
            read_result = tokio::time::timeout(read_timeout, fsm::read_message(&mut stream)) => {
                match read_result {
                    Ok(Ok((fsm::MSG_UPDATE, body))) => {
                        let entries = fsm::parse_update_entries(&body)?;
                        if !entries.is_empty() {
                            let sync_data = codec::decode_sync_data(&entries)?;
                            eprintln!(
                                "[bgp-sync] received {} rules, {} DNS servers, {} nodes from {peer_addr}",
                                sync_data.rules.rules.len(),
                                sync_data.dns.as_ref().map_or(0, |d| d.servers.len()),
                                sync_data.node_uris.len()
                            );
                            on_remote_update(sync_data);
                        }
                        // Empty UPDATE = end-of-rib for initial sync, not an error in persistent mode
                    }
                    Ok(Ok((fsm::MSG_KEEPALIVE, _))) => {
                        // Peer is alive, nothing to do
                    }
                    Ok(Ok((fsm::MSG_NOTIFICATION, body))) => {
                        let code = body.first().copied().unwrap_or(0);
                        return Err(format!("peer NOTIFICATION: code={code}"));
                    }
                    Ok(Ok(_)) => {}
                    Ok(Err(e)) => return Err(format!("read error: {e}")),
                    Err(_) => return Err("peer timeout (no message in 90s)".to_string()),
                }
            }
            // Local files changed — push update to peer
            _ = file_rx.recv() => {
                // Debounce: drain any queued signals and wait briefly
                tokio::time::sleep(Duration::from_millis(500)).await;
                while file_rx.try_recv().is_ok() {}

                let entries = collect_local_data();
                stream
                    .write_all(&fsm::build_update(&entries))
                    .await
                    .map_err(|e| format!("send UPDATE: {e}"))?;
                eprintln!("[bgp-sync] pushed local changes to {peer_addr}");
            }
            // Send keepalive
            _ = keepalive_timer.tick() => {
                stream
                    .write_all(&fsm::build_keepalive())
                    .await
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
        // d0 ~= 1000-2000ms, d1 ~= 2000-3000ms, d5 ~= 32000-33000ms
        assert!(d0 < d1);
        assert!(d1 < d5);
    }

    #[test]
    fn backoff_caps_at_60s() {
        let d = backoff_duration(20);
        assert!(d <= Duration::from_secs(60));
    }
}
```

- [ ] **Step 2: Verify compilation**

Run: `cargo check -p calamity-core`
Expected: Compiles (may need minor import fixes)

- [ ] **Step 3: Run tests**

Run: `cargo test -p calamity-core bgp::sync_session`
Expected: 2 tests pass

- [ ] **Step 4: Commit**

```bash
git add crates/calamity-core/src/singbox/bgp/sync_session.rs
git commit -m "feat(bgp): add SyncSession with persistent bidirectional sync"
```

---

### Task 4: Implement peer discovery (mDNS + Tailscale probe)

**Files:**
- Create: `crates/calamity-core/src/singbox/bgp/discovery.rs`

- [ ] **Step 1: Write discovery module**

Create `crates/calamity-core/src/singbox/bgp/discovery.rs`:

```rust
use std::net::{Ipv4Addr, SocketAddr};
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
/// Returns a handle; drop it to unregister.
pub fn register_mdns(hostname: &str, port: u16) -> Result<mdns_sd::ServiceDaemon, String> {
    let mdns = mdns_sd::ServiceDaemon::new().map_err(|e| format!("mDNS daemon: {e}"))?;
    let service_info = mdns_sd::ServiceInfo::new(
        MDNS_SERVICE_TYPE,
        hostname,
        hostname,
        "",
        port,
        None,
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
            Ok(Ok(Ok(_))) => {} // other events
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

    let mut peers = Vec::new();
    for device in devices {
        if device.is_self || device.ip.is_empty() {
            continue;
        }
        // Probe port 17900
        let addr = format!("{}:{}", device.ip, BGP_PORT);
        if let Ok(socket_addr) = addr.parse::<SocketAddr>() {
            if tokio::time::timeout(
                Duration::from_secs(2),
                tokio::net::TcpStream::connect(socket_addr),
            )
            .await
            .is_ok()
            {
                peers.push(DiscoveredPeer {
                    name: device.name,
                    address: device.ip,
                    source: DiscoverySource::Tailscale,
                });
            }
        }
    }

    peers
}

/// Discover peers from all sources (mDNS + Tailscale).
pub async fn discover_all() -> Vec<DiscoveredPeer> {
    let (mdns_peers, ts_peers) = tokio::join!(
        discover_mdns(Duration::from_secs(3)),
        discover_tailscale()
    );

    let mut all = mdns_peers;
    // Deduplicate by address
    let existing_addrs: std::collections::HashSet<String> =
        all.iter().map(|p| p.address.clone()).collect();
    for p in ts_peers {
        if !existing_addrs.contains(&p.address) {
            all.push(p);
        }
    }
    all
}
```

- [ ] **Step 2: Verify compilation**

Run: `cargo check -p calamity-core`
Expected: Compiles

- [ ] **Step 3: Commit**

```bash
git add crates/calamity-core/src/singbox/bgp/discovery.rs
git commit -m "feat(bgp): add peer discovery via mDNS and Tailscale port probe"
```

---

### Task 5: Extend speaker for long-lived incoming sessions

**Files:**
- Modify: `crates/calamity-core/src/singbox/bgp/speaker.rs`

- [ ] **Step 1: Add on_remote_update callback and persistent incoming session handling**

Replace the speaker's `serve_rules` call with a long-lived bidirectional session for incoming connections:

```rust
use std::net::Ipv4Addr;
use std::sync::Arc;
use tokio::io::AsyncWriteExt;
use tokio::net::TcpListener;
use tokio::sync::watch;

use super::{codec, fsm, sync_session};

pub struct BgpSpeaker {
    shutdown_tx: watch::Sender<bool>,
}

impl BgpSpeaker {
    pub async fn start(
        tailscale_ip: Ipv4Addr,
        on_remote_update: Option<sync_session::OnRemoteUpdate>,
    ) -> Result<Self, String> {
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
                            Ok((mut stream, peer_addr)) => {
                                eprintln!("[bgp] incoming connection from {peer_addr}");
                                let rid = router_id;
                                let callback = on_remote_update.clone();
                                tokio::spawn(async move {
                                    if let Err(e) = handle_incoming(
                                        &mut stream, rid, callback,
                                    ).await {
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

/// Handle an incoming connection: handshake, send local data, then enter
/// bidirectional loop if a callback is set, otherwise one-shot serve.
async fn handle_incoming(
    stream: &mut tokio::net::TcpStream,
    router_id: [u8; 4],
    on_remote_update: Option<sync_session::OnRemoteUpdate>,
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
        // Long-lived: read updates from peer
        loop {
            match tokio::time::timeout(
                std::time::Duration::from_secs(90),
                fsm::read_message(stream),
            )
            .await
            {
                Ok(Ok((fsm::MSG_UPDATE, body))) => {
                    let parsed = fsm::parse_update_entries(&body)?;
                    if !parsed.is_empty() {
                        let sync_data = codec::decode_sync_data(&parsed)?;
                        callback(sync_data);
                    }
                }
                Ok(Ok((fsm::MSG_KEEPALIVE, _))) => {
                    stream
                        .write_all(&fsm::build_keepalive())
                        .await
                        .map_err(|e| format!("send KEEPALIVE: {e}"))?;
                }
                Ok(Ok(_)) => {}
                Ok(Err(e)) => return Err(e),
                Err(_) => return Err("peer timeout".to_string()),
            }
        }
    } else {
        // One-shot: send end-of-rib and close
        stream
            .write_all(&fsm::build_update(&[]))
            .await
            .map_err(|e| format!("send end-of-rib: {e}"))?;
        let _ = tokio::time::timeout(std::time::Duration::from_secs(5), async {
            let mut buf = [0u8; 1];
            let _ = tokio::io::AsyncReadExt::read(stream, &mut buf).await;
        })
        .await;
        let _ = stream.shutdown().await;
    }

    Ok(())
}

pub fn get_tailscale_ip() -> Option<Ipv4Addr> {
    crate::platform::get_tailscale_ip()
}
```

Note: `collect_local_data()` in sync_session needs to be made `pub`.

- [ ] **Step 2: Make collect_local_data public in sync_session.rs**

Change `fn collect_local_data()` to `pub fn collect_local_data()` in `sync_session.rs`.

- [ ] **Step 3: Update callers of BgpSpeaker::start**

In `src-tauri/src/commands/bgp_sync.rs`, update the `start` call to pass `None` for backward compat:

```rust
// Where BgpSpeaker::start(ip) is called, change to:
BgpSpeaker::start(ip, None)
```

Similarly in `crates/calamityd/src/main.rs`.

- [ ] **Step 4: Verify compilation and tests**

Run: `cargo check -p calamity-core -p calamity -p calamityd`
Expected: Compiles

Run: `cargo test -p calamity-core`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add crates/calamity-core/src/singbox/bgp/speaker.rs crates/calamity-core/src/singbox/bgp/sync_session.rs src-tauri/src/commands/bgp_sync.rs crates/calamityd/src/main.rs
git commit -m "feat(bgp): extend speaker for long-lived bidirectional sessions"
```

---

### Task 6: Add Tauri commands for sync control

**Files:**
- Modify: `src-tauri/src/commands/bgp_sync.rs`
- Modify: `src-tauri/src/lib.rs` (register new commands)

- [ ] **Step 1: Add sync session state and new commands**

In `src-tauri/src/commands/bgp_sync.rs`, add:

```rust
use crate::singbox::bgp::sync_session::{SyncSession, SyncStatus, OnRemoteUpdate};
use std::sync::Arc;
use tokio::sync::Mutex;

// Add to Tauri managed state (in lib.rs):
// app.manage(Arc::new(Mutex::new(Option::<SyncSession>::None)));

#[tauri::command]
pub async fn bgp_start_sync(
    app: AppHandle,
    peer_id: String,
) -> Result<(), String> {
    let bgp_settings = storage::load_bgp_settings();
    let peer = bgp_settings.peers.iter()
        .find(|p| p.id == peer_id)
        .ok_or_else(|| format!("peer {peer_id} not found"))?;
    let peer_addr = peer.address.clone();

    let ip = speaker::get_tailscale_ip()
        .ok_or("Tailscale IP not found")?;
    let router_id = ip.octets();

    // Create callback that applies remote data
    let app_handle = app.clone();
    let on_update: OnRemoteUpdate = Arc::new(move |sync_data| {
        let app = app_handle.clone();
        tokio::spawn(async move {
            if let Err(e) = apply_sync_data(&app, sync_data).await {
                eprintln!("[bgp-sync] apply error: {e}");
            }
        });
    });

    let session = SyncSession::start(peer_addr, router_id, on_update).await?;

    // Store session and active_peer
    let state = app.state::<Arc<Mutex<Option<SyncSession>>>>();
    *state.lock().await = Some(session);

    let mut settings = storage::load_bgp_settings();
    settings.active_peer = Some(peer_id);
    storage::save_bgp_settings(&settings)?;

    Ok(())
}

#[tauri::command]
pub async fn bgp_stop_sync(app: AppHandle) -> Result<(), String> {
    let state = app.state::<Arc<Mutex<Option<SyncSession>>>>();
    if let Some(session) = state.lock().await.take() {
        session.stop();
    }

    let mut settings = storage::load_bgp_settings();
    settings.active_peer = None;
    storage::save_bgp_settings(&settings)?;

    Ok(())
}

#[tauri::command]
pub async fn bgp_sync_status(app: AppHandle) -> Result<SyncStatus, String> {
    let state = app.state::<Arc<Mutex<Option<SyncSession>>>>();
    match state.lock().await.as_ref() {
        Some(session) => Ok(session.status().await),
        None => Ok(SyncStatus::Disconnected),
    }
}

/// Apply incoming sync data: save rules/DNS/nodes, reload sing-box.
async fn apply_sync_data(app: &AppHandle, data: codec::SyncData) -> Result<(), String> {
    use crate::singbox::{dns_storage, nodes_storage, rules_storage, subscription_fetch};

    // Save rules
    rules_storage::save_rules(&data.rules)?;

    // Save DNS
    if let Some(dns) = data.dns {
        dns_storage::save_dns_settings(&dns)?;
    }

    // Save nodes from URIs
    if !data.node_uris.is_empty() {
        let mut nodes_data = nodes_storage::load_nodes();
        for uri_line in &data.node_uris {
            if let Some((group_name, uri)) = uri_line.split_once('\t') {
                if let Ok(node) = subscription_fetch::parse_v2ray_uri(uri) {
                    let group = nodes_data.groups.iter_mut()
                        .find(|g| g.name == group_name);
                    if let Some(group) = group {
                        if !group.nodes.iter().any(|n| n.name == node.name) {
                            group.nodes.push(node);
                        }
                    } else {
                        nodes_data.groups.push(nodes_storage::NodeGroup {
                            id: uuid::Uuid::new_v4().to_string(),
                            name: group_name.to_string(),
                            nodes: vec![node],
                        });
                    }
                }
            }
        }
        nodes_storage::save_nodes(&nodes_data)?;
    }

    // Reload sing-box
    let process = app.state::<Arc<crate::singbox::process::SingboxProcess>>().inner().clone();
    let settings = crate::singbox::storage::load_settings();
    let _ = process.reload(&settings).await;
    let _ = app.emit("singbox-restarted", ());

    Ok(())
}
```

- [ ] **Step 2: Replace bgp_discover_peers with new discovery**

```rust
#[tauri::command]
pub async fn bgp_discover_peers() -> Result<Vec<discovery::DiscoveredPeer>, String> {
    Ok(discovery::discover_all().await)
}
```

Remove the old `DiscoveredPeer` struct and the hostname filter logic.

- [ ] **Step 3: Register new commands and managed state in lib.rs**

In `src-tauri/src/lib.rs`, add to the Tauri builder:

```rust
.manage(Arc::new(Mutex::new(Option::<bgp::sync_session::SyncSession>::None)))
```

And register the new commands:

```rust
commands::bgp_sync::bgp_start_sync,
commands::bgp_sync::bgp_stop_sync,
commands::bgp_sync::bgp_sync_status,
```

- [ ] **Step 4: Verify compilation**

Run: `cargo check -p calamity`
Expected: Compiles

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/bgp_sync.rs src-tauri/src/lib.rs
git commit -m "feat(bgp): add Tauri commands for persistent sync control"
```

---

### Task 7: Add daemon IPC handlers for sync

**Files:**
- Modify: `crates/calamity-core/src/ipc/protocol.rs`
- Modify: `crates/calamityd/src/main.rs`

- [ ] **Step 1: Add new IPC commands**

In `protocol.rs`, add to the `Command` enum:

```rust
BgpStartSync { peer_id: String },
BgpStopSync,
BgpSyncStatus,
```

- [ ] **Step 2: Add handlers in daemon**

In `crates/calamityd/src/main.rs`, add handlers for the new commands. The daemon should:
- `BgpStartSync`: Start a `SyncSession` with the given peer, store in app state
- `BgpStopSync`: Stop the active session, clear `active_peer`
- `BgpSyncStatus`: Return current `SyncStatus`
- On startup: if `active_peer` is set, auto-start sync session

- [ ] **Step 3: Add CLI support**

In `crates/calamity-cli/src/main.rs`, add subcommands:

```rust
/// BGP sync commands
Bgp {
    #[command(subcommand)]
    action: BgpAction,
}

enum BgpAction {
    /// Start syncing with a peer
    Sync { peer_id: String },
    /// Stop syncing
    Unsync,
    /// Show sync status
    Status,
    // ... existing commands
}
```

- [ ] **Step 4: Verify compilation**

Run: `cargo check -p calamity-core -p calamityd -p calamity-cli`
Expected: Compiles

- [ ] **Step 5: Commit**

```bash
git add crates/calamity-core/src/ipc/protocol.rs crates/calamityd/src/main.rs crates/calamity-cli/src/main.rs
git commit -m "feat(bgp): add daemon IPC handlers and CLI for persistent sync"
```

---

### Task 8: Update frontend for sync UX

**Files:**
- Modify: `src/services/bgp-sync.ts`
- Modify: `src/services/types.ts`
- Modify: `src/stores/bgp-sync.ts`
- Modify: `src/pages/BgpSyncPage.tsx`

- [ ] **Step 1: Add types and service methods**

In `src/services/bgp-sync.ts`, add to the service interface:

```typescript
startSync(peerId: string): Promise<void>;
stopSync(): Promise<void>;
getSyncStatus(): Promise<SyncStatus>;
```

Add `SyncStatus` type:

```typescript
export type SyncStatus = "disconnected" | "connecting" | "synced" | { "reconnecting": { attempt: number } };
```

Implement in Tauri service:

```typescript
async startSync(peerId) {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("bgp_start_sync", { peerId });
},
async stopSync() {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("bgp_stop_sync");
},
async getSyncStatus() {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<SyncStatus>("bgp_sync_status");
},
```

- [ ] **Step 2: Update Zustand store**

In `src/stores/bgp-sync.ts`, add:

```typescript
syncStatus: SyncStatus;
activePeer: string | null;
startSync: (peerId: string) => Promise<void>;
stopSync: () => Promise<void>;
pollStatus: () => Promise<void>;
```

- [ ] **Step 3: Update BgpSyncPage UI**

Replace the per-peer PULL button with sync flow:
- Peer list: each peer shows a "Sync" button (or "Syncing" indicator if active)
- Clicking "Sync" on a peer: pull diff → preview dialog → confirm → start persistent sync
- Active peer shows connection status badge (Synced / Reconnecting / Connecting)
- "Stop Sync" button to disconnect
- Poll `getSyncStatus()` every 5s while synced to update status display

- [ ] **Step 4: Verify frontend builds**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/services/bgp-sync.ts src/stores/bgp-sync.ts src/pages/BgpSyncPage.tsx
git commit -m "feat(bgp): update UI for persistent sync with status display"
```

---

### Task 9: Register mDNS on speaker start

**Files:**
- Modify: `crates/calamity-core/src/singbox/bgp/speaker.rs`

- [ ] **Step 1: Register mDNS when speaker starts**

In `BgpSpeaker::start`, after binding the listener, register mDNS:

```rust
pub struct BgpSpeaker {
    shutdown_tx: watch::Sender<bool>,
    _mdns: Option<mdns_sd::ServiceDaemon>,
}

// In start():
let mdns = super::discovery::register_mdns("calamity", 17900).ok();
// ...
Ok(Self { shutdown_tx, _mdns: mdns })
```

When the speaker is dropped, `ServiceDaemon` drop will unregister.

- [ ] **Step 2: Verify compilation**

Run: `cargo check -p calamity-core`
Expected: Compiles

- [ ] **Step 3: Commit**

```bash
git add crates/calamity-core/src/singbox/bgp/speaker.rs
git commit -m "feat(bgp): register mDNS service on speaker start"
```

---

### Task 10: Integration test and push

- [ ] **Step 1: Run full test suite**

Run: `cargo test -p calamity-core`
Expected: All tests pass

- [ ] **Step 2: Run TypeScript checks**

Run: `npx tsc --noEmit && npx vitest run`
Expected: All pass

- [ ] **Step 3: Push and trigger CI**

```bash
git push origin main
gh workflow run manual-release.yml -f tag_name=v0.3.2-beta -f draft=false -f prerelease=true
```

- [ ] **Step 4: Verify CI passes**

Run: `gh run list --workflow manual-release.yml -L 1`
Expected: Success
