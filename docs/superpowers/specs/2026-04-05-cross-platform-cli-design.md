# Cross-Platform CLI & Linux Support Design

## Goal

Add a headless Linux daemon (`calamityd`) and cross-platform CLI (`calamity`) to Calamity, enabling full proxy management on Linux servers and CLI control of the macOS GUI app.

## Architecture

Cargo workspace with shared core library. macOS GUI and Linux daemon both depend on `calamity-core`. CLI is a pure IPC client that connects to either GUI (macOS) or daemon (Linux) via Unix domain socket.

```
macOS:  Calamity.app (GUI + socket server) ←── Unix socket ──→ calamity (CLI, optional)
Linux:  calamityd (daemon + socket server) ←── Unix socket ──→ calamity (CLI)
```

## Tech Stack

- **Core:** Rust 2021, Tokio, serde_json
- **CLI:** clap (derive API)
- **IPC:** Unix domain socket, JSON + length-prefix framing
- **Packaging:** cargo-deb, cargo-generate-rpm, PKGBUILD script
- **CI:** GitHub Actions with cross-compilation matrix

---

## 1. Project Structure — Cargo Workspace

```
calamity/
├── Cargo.toml                  # workspace root
├── crates/
│   ├── calamity-core/          # shared core library
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── singbox/        # extracted from src-tauri
│   │       ├── platform/       # platform abstraction
│   │       │   ├── mod.rs
│   │       │   ├── macos.rs    # networksetup, pfctl, pmset, ifconfig
│   │       │   └── linux.rs    # gsettings, iptables/nftables, systemd-inhibit, ip addr
│   │       └── ipc/            # Unix socket protocol
│   │           ├── mod.rs
│   │           ├── protocol.rs # message definitions
│   │           ├── server.rs   # socket server
│   │           └── client.rs   # socket client
│   ├── calamity-cli/           # CLI client binary
│   │   ├── Cargo.toml
│   │   └── src/main.rs
│   └── calamityd/              # Linux daemon binary
│       ├── Cargo.toml
│       └── src/main.rs
├── src-tauri/                  # macOS GUI (depends on calamity-core)
├── src/                        # React frontend (unchanged)
├── packaging/
│   ├── systemd/
│   │   └── calamityd.service
│   ├── deb/
│   ├── rpm/
│   └── pacman/
```

## 2. Platform Abstraction (calamity-core/platform)

Compile-time feature flags select platform implementation:

```toml
# calamity-core/Cargo.toml
[features]
default = []
macos = []
linux = []
```

```toml
# src-tauri/Cargo.toml (GUI)
calamity-core = { path = "../crates/calamity-core", features = ["macos"] }

# calamityd/Cargo.toml (daemon)
calamity-core = { path = "../crates/calamity-core", features = ["linux"] }

# calamity-cli/Cargo.toml (CLI — no platform feature, pure IPC client)
calamity-core = { path = "../crates/calamity-core" }
```

Platform trait with compile-time selection:

```rust
pub trait Platform: Send + Sync {
    fn set_system_proxy(&self, http_port: u16, socks_port: u16) -> Result<()>;
    fn clear_system_proxy(&self) -> Result<()>;
    fn enable_gateway(&self, config: &GatewayConfig) -> Result<()>;
    fn disable_gateway(&self) -> Result<()>;
    fn disable_sleep(&self) -> Result<()>;
    fn enable_sleep(&self) -> Result<()>;
    fn get_tailscale_ip(&self) -> Option<Ipv4Addr>;
    fn default_singbox_path(&self) -> PathBuf;
    fn data_dir(&self) -> PathBuf;
}

#[cfg(feature = "macos")]
pub use macos::MacOSPlatform as NativePlatform;
#[cfg(feature = "linux")]
pub use linux::LinuxPlatform as NativePlatform;
```

| Feature | macOS | Linux |
|:---|:---|:---|
| System proxy | `networksetup` | `gsettings` (GNOME) / `kwriteconfig5` (KDE) |
| Gateway mode | `pfctl` + `sysctl` | `iptables`/`nftables` + `sysctl` |
| Sleep prevention | `pmset` | `systemd-inhibit` |
| Tailscale IP | `ifconfig` | `ip addr` |
| Data directory | `~/Library/Application Support/com.calamity.app/` | `~/.config/calamity` (user) / `/etc/calamity` (daemon) |

## 3. IPC Protocol (calamity-core/ipc)

### Socket Paths

- macOS: `~/Library/Application Support/com.calamity.app/calamity.sock`
- Linux user mode: `$XDG_RUNTIME_DIR/calamity.sock`
- Linux daemon: `/run/calamity/calamity.sock`

### Frame Format

```
[4 bytes: payload length (u32 big-endian)] [JSON payload]
```

### Commands

```rust
#[derive(Serialize, Deserialize)]
pub struct Request {
    pub id: u32,
    pub command: Command,
}

#[derive(Serialize, Deserialize)]
pub enum Response {
    Ok(Value),
    Error(String),
}

#[derive(Serialize, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum Command {
    // Connection control
    Start,
    Stop,
    Restart,
    Status,

    // Mode
    SetProxyMode { mode: String },

    // Nodes
    GetNodes,
    SelectNode { group: String, node: String },
    LatencyTest { group: String, node: Option<String> },

    // Rules
    GetRules,
    AddRule { rule: RouteRuleConfig },
    RemoveRule { id: String },

    // Subscriptions
    GetSubscriptions,
    UpdateSubscription { id: Option<String> },

    // DNS
    GetDnsServers,

    // Settings
    GetSettings,
    UpdateSettings { settings: Value },

    // BGP
    BgpGetSettings,
    BgpPullRules { peer_addr: String },
    BgpApplyRules { rules: Value },
    BgpDiscoverPeers,

    // Tailscale
    TailscaleStatus,
    TailscaleAuth,
    TailscaleLogout,
    TailscaleSetExitNode { node: Option<String> },
}
```

## 4. CLI Design (calamity-cli)

Built with `clap` derive API. All commands are IPC client calls.

```
calamity <command> [subcommand] [flags]

Connection:
  calamity start                           # start proxy
  calamity stop                            # stop proxy
  calamity restart                         # restart proxy
  calamity status                          # show status (mode, speed, connections)

Mode:
  calamity mode direct                     # direct mode
  calamity mode rule                       # rule-based mode
  calamity mode global                     # global proxy mode

Nodes:
  calamity node list                       # list all groups and nodes
  calamity node select <group> <node>      # select node in group
  calamity node test <group> [node]        # latency test (omit node = batch)

Rules:
  calamity rule list                       # list rules
  calamity rule add <type> <value> <outbound>  # add rule
  calamity rule remove <id>                # remove rule

Subscriptions:
  calamity sub list                        # list subscriptions
  calamity sub update [id]                 # update subscription (omit = all)

Settings:
  calamity config get                      # show settings
  calamity config set <key> <value>        # modify setting

BGP Sync:
  calamity bgp status                      # BGP status and peer list
  calamity bgp pull <peer>                 # pull remote rules (shows diff)
  calamity bgp apply                       # apply last pulled rules
  calamity bgp discover                    # discover peers on tailnet

Tailscale:
  calamity tailscale status                # connection status
  calamity tailscale auth                  # OAuth login, register node
  calamity tailscale logout                # logout
  calamity tailscale exit-node [node]      # switch exit node

Global flags:
  --socket <path>                          # custom socket path
  --json                                   # JSON output (for scripting)
```

## 5. Linux Daemon (calamityd)

### systemd Service

```ini
# /usr/lib/systemd/system/calamityd.service
[Unit]
Description=Calamity Proxy Daemon
After=network-online.target
Wants=network-online.target

[Service]
Type=notify
ExecStart=/usr/bin/calamityd
ExecReload=/bin/kill -HUP $MAINPID
Restart=on-failure
RuntimeDirectory=calamity
StateDirectory=calamity
LogsDirectory=calamity

[Install]
WantedBy=multi-user.target
```

### Daemon Responsibilities

- Load config and start sing-box subprocess on startup
- Listen on Unix socket, handle CLI commands
- Detect Tailscale, start BGP listener if available
- SIGHUP → reload config
- SIGTERM → graceful cleanup (stop sing-box, disable gateway, clear system proxy)
- sd_notify to inform systemd of readiness

### Logging

- Daemon logs → stdout/stderr → captured by journald (`journalctl -u calamityd`)
- sing-box logs → `/var/log/calamity/singbox.log`
- No real-time log streaming via IPC (use `journalctl` instead)

### File Layout

| Path | Purpose |
|:---|:---|
| `/usr/bin/calamityd` | daemon binary |
| `/usr/bin/calamity` | CLI binary |
| `/usr/lib/calamity/sing-box` | bundled sing-box binary |
| `/usr/lib/systemd/system/calamityd.service` | systemd unit |
| `/etc/calamity/` | config files (settings.json, rules.json, etc.) |
| `/var/lib/calamity/` | subscription cache, runtime data |
| `/var/log/calamity/` | sing-box logs |
| `/run/calamity/calamity.sock` | IPC socket |

### Linux Tailscale Integration

Two modes:

| Mode | Description |
|:---|:---|
| Detect | Detect running Tailscale on host, use its IP for BGP |
| Register | OAuth API to generate auth key, run `tailscale up --authkey=...` to join tailnet |

- `calamity tailscale auth` → generate device code → print login URL → poll for token → `tailscale up`
- `calamity tailscale status` → show Tailscale connection info

## 6. macOS GUI Changes

### Minimal changes to existing GUI:

1. **Depend on calamity-core** — migrate `src-tauri/src/singbox/` into core, Tauri commands become thin wrappers calling core functions
2. **Add socket server** — start IPC server in `setup()`, listen at `~/Library/Application Support/com.calamity.app/calamity.sock`
3. **IPC handlers reuse Tauri command logic** — CLI `Command::Start` invokes same core function as frontend `invoke("singbox_start")`
4. **Cleanup socket on exit**

### Unchanged:

- React frontend — no changes
- Tauri command interfaces — same API, different internal implementation
- Frontend service layer — no changes
- Configuration file format — no changes

## 7. Packaging & CI

### Linux Build Matrix

| Format | x86_64 | aarch64 |
|:---|:---|:---|
| deb | `calamity_x.x.x_amd64.deb` | `calamity_x.x.x_arm64.deb` |
| rpm | `calamity-x.x.x.x86_64.rpm` | `calamity-x.x.x.aarch64.rpm` |
| pacman | `calamity-x.x.x-x86_64.pkg.tar.zst` | `calamity-x.x.x-aarch64.pkg.tar.zst` |
| tarball | `calamity-x.x.x-linux-amd64.tar.gz` | `calamity-x.x.x-linux-arm64.tar.gz` |

### Package Contents

- `/usr/bin/calamity` — CLI
- `/usr/bin/calamityd` — daemon
- `/usr/lib/calamity/sing-box` — bundled sing-box
- `/usr/lib/systemd/system/calamityd.service` — systemd unit
- `/etc/calamity/` — default configuration

### Build Tools

- `cargo-deb` for .deb packages
- `cargo-generate-rpm` for .rpm packages
- PKGBUILD script for pacman packages
- tar for tarball

### CI Workflow (new `linux-release.yml`)

```yaml
strategy:
  matrix:
    target: [x86_64-unknown-linux-gnu, aarch64-unknown-linux-gnu]
```

1. Checkout + Rust toolchain + cross-compilation tools
2. Download sing-box for target architecture
3. `cargo build --release -p calamity-cli -p calamityd --target $TARGET`
4. Generate deb/rpm/pacman/tarball
5. Upload to GitHub Release

macOS workflow unchanged except `src-tauri` now depends on `calamity-core`.

## 8. Product Matrix

| Platform | Products |
|:---|:---|
| macOS | Calamity.app (GUI with embedded socket server) + calamity CLI (optional) |
| Linux | calamityd (systemd daemon) + calamity CLI + deb/rpm/pacman/tarball |

## 9. Compatibility

- Configuration file format unchanged — no breaking changes
- Core extraction is internal refactoring — external behavior preserved
- Existing macOS GUI users upgrade seamlessly
- Linux is a new platform — no migration needed
