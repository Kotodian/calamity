<h1 align="center">
  <img src="./docs/screenshots/logo.png" alt="Calamity" width="150" />
  <br>
  Calamity
</h1>

<h3 align="center">
A modern, feature-rich macOS & Linux proxy client powered by <a href="https://sing-box.sagernet.org/">sing-box</a>
</h3>

<p align="center">
  <a href="https://github.com/Kotodian/calamity/releases">
    <img src="https://img.shields.io/github/v/release/Kotodian/calamity?include_prereleases&style=flat-square&color=e94560" alt="Release" />
  </a>
  <a href="https://github.com/Kotodian/calamity/actions">
    <img src="https://img.shields.io/github/actions/workflow/status/Kotodian/calamity/manual-release.yml?style=flat-square" alt="Build" />
  </a>
  <a href="https://github.com/Kotodian/calamity/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/Kotodian/calamity?style=flat-square&color=0f3460" alt="License" />
  </a>
  <a href="https://github.com/Kotodian/calamity/releases">
    <img src="https://img.shields.io/github/downloads/Kotodian/calamity/total?style=flat-square&color=16213e" alt="Downloads" />
  </a>
</p>

<p align="center">
  <a href="./README.md">English</a>
  &nbsp;|&nbsp;
  <a href="./README.zh-CN.md">简体中文</a>
</p>

---

## Preview

<table>
  <tr>
    <td><img src="./docs/screenshots/dashboard-light.png?v=2" alt="Dashboard Light" width="550" /></td>
    <td><img src="./docs/screenshots/dashboard-dark.png?v=2" alt="Dashboard Dark" width="550" /></td>
  </tr>
  <tr>
    <td align="center"><strong>Dashboard</strong> — Light Mode</td>
    <td align="center"><strong>Dashboard</strong> — Dark Mode</td>
  </tr>
  <tr>
    <td><img src="./docs/screenshots/nodes.png?v=2" alt="Nodes" width="550" /></td>
    <td><img src="./docs/screenshots/rules.png?v=2" alt="Rules" width="550" /></td>
  </tr>
  <tr>
    <td align="center"><strong>Nodes</strong> — Proxy group & node management</td>
    <td align="center"><strong>Rules</strong> — Routing rules & rulesets</td>
  </tr>
  <tr>
    <td><img src="./docs/screenshots/subscriptions.png?v=2" alt="Subscriptions" width="550" /></td>
    <td><img src="./docs/screenshots/tray.png?v=2" alt="Tray" width="550" /></td>
  </tr>
  <tr>
    <td align="center"><strong>Subscriptions</strong> — Node subscription management</td>
    <td align="center"><strong>Tray</strong> — Compact quick-access window</td>
  </tr>
    <tr>
    <td><img src="./docs/screenshots/tailscale.png?v=2" alt="Tailscale" width="550" /></td>
  </tr>
  <tr>
    <td align="center"><strong>Tailscale</strong> — Tailscale management</td>
  </tr>
</table>

## Features

**Core Proxy**

- Three connection modes: Direct, Rule-based, and Global proxy
- Node groups with latency testing (single / batch)
- Proxy chain support — combine multiple nodes in sequence
- Rich protocol support via sing-box: VMess, VLESS, Shadowsocks, Trojan, Reality, and more

**Rules & Routing**

- Flexible rule-based routing with domain, IP, GeoSite, and GeoIP matchers
- Rule inversion, final outbound selection, per-site quick actions
- Ruleset Market — browse and install community rulesets with one click

**DNS**

- Full DNS server management with custom upstream resolvers
- Fake-IP support for TUN mode
- Auto-generation of DNS detour rules from route configuration
- DNS hijacking support (sing-box 1.12+)

**TUN Mode**

- Native TUN inbound with administrator privilege handling (macOS) / root (Linux)
- Configurable stack, MTU, auto-route, strict-route, and DNS hijack settings
- Automatic Fake-IP enforcement and graceful cleanup on exit

**Gateway Mode**

- Transparent LAN gateway — other devices set this machine as their gateway to proxy all traffic
- Platform-native packet redirection: pf route-to (macOS), nftables (Linux)
- Fake-IP DNS (198.18.0.2) for zero-delay resolution and smart routing
- Tailscale SNAT for LAN devices to access Tailscale nodes with correct return routing
- TCP MSS clamping to avoid fragmentation when Tailscale forces lower MTU
- One-toggle activation with automatic cleanup on exit

**AI Auth Gateway**

- Centralized AI API authentication management in gateway mode — configure API keys once and share access across all LAN devices
- Supported providers: OpenAI, Anthropic Claude, Google Gemini
- DNS-based reverse proxy with automatic Authorization / API-key header injection per provider
- Supports both API Key and OAuth authentication flows with token lifecycle management
- LAN devices install the CA certificate via `http://gateway-ip:8900` for HTTPS interception
- Per-service enable/disable toggle and connectivity testing

**Rule Sync (BGP)**

- Synchronize routing rules between Calamity instances over Tailscale network
- Built-in lightweight BGP speaker with custom AFI/SAFI for rule encoding
- Auto-discover other Calamity devices on your Tailnet or manually add peers
- Pull rules with diff preview — see added, removed, and modified rules before applying
- Phase 1: manual pull; Phase 2 (planned): persistent sessions with auto-sync

**Subscriptions**

- Multi-subscription management with auto-update intervals
- Clash YAML subscription parsing
- Concurrent fetching with shared HTTP client for faster updates

**Tailscale Integration**

- OAuth-based device management
- Exit node switching, ACL tags, MagicDNS support
- Auto-injection of Tailscale routes and DNS rules into sing-box config

**UI / UX**

- Full dashboard with real-time traffic charts, speed, memory, and connection count
- Compact tray window for quick mode switching and status monitoring
- Dark theme with backdrop-blur glass effects
- Bilingual interface: English & Simplified Chinese
- Drag-and-drop rule and node reordering

**CLI & Daemon (Linux)**

- Headless daemon (`calamityd`) — runs as a systemd service, no GUI required
- Full-featured CLI (`calamity`) — manage everything from the terminal
- IPC over Unix domain socket for fast, secure local communication
- Commands: `start`, `stop`, `restart`, `status`, `mode`, `node`, `rule`, `sub`, `config`, `bgp`, `tailscale`

```bash
# Switch proxy mode
calamity mode rule

# Select a node
calamity node select "Japan-Tokyo-01"

# Update all subscriptions
calamity sub update --all

# Show real-time status
calamity status
```

## Install

### System Requirements

| OS | Architecture | Minimum Version |
|:---|:---|:---|
| macOS | Apple Silicon (aarch64) | macOS 10.15+ |
| Linux | x86_64 / aarch64 | Kernel 5.4+, systemd 245+ |

### Download

Go to [**Releases**](https://github.com/Kotodian/calamity/releases) to download the latest release.

#### macOS

| Format | Description | Link |
|:---|:---|:---|
| `.dmg` | macOS GUI installer | [GitHub Releases](https://github.com/Kotodian/calamity/releases) |

> **Note**: After installation, macOS may block the app. Right-click the app and select "Open" to bypass Gatekeeper, or run:
> ```bash
> xattr -cr /Applications/Calamity.app
> ```

#### Linux

| Format | Architecture | Install Command |
|:---|:---|:---|
| `.deb` | x86_64 / aarch64 | `sudo dpkg -i calamity_*.deb` |
| `.rpm` | x86_64 / aarch64 | `sudo rpm -i calamity-*.rpm` |
| `.pkg.tar.zst` | x86_64 / aarch64 | `sudo pacman -U calamity-*.pkg.tar.zst` |
| `.tar.gz` | x86_64 / aarch64 | Extract and place binaries in `PATH` |

All Linux packages install two binaries: `calamityd` (headless daemon) and `calamity` (CLI), plus a systemd service unit.

```bash
# Enable and start the daemon
sudo systemctl enable --now calamityd

# Check status
calamity status
```

## Tech Stack

| Layer | Technology |
|:---|:---|
| Frontend | React 19, TypeScript 6, Vite 8, Tailwind CSS 4 |
| State | Zustand |
| UI Components | shadcn/ui (Radix UI) |
| Charts | Recharts |
| i18n | i18next |
| Desktop | Tauri 2 |
| Backend | Rust 2024, Tokio |
| Shared Library | calamity-core (Cargo workspace) |
| Proxy Core | sing-box (sidecar) |
| Testing | Vitest, React Testing Library |

## Development

### Prerequisites

- macOS or Linux
- Node.js 20+ (GUI builds only)
- Rust toolchain
- Tauri CLI (`cargo install tauri-cli`)
- `sing-box` binary available in `PATH`

### Quick Start

```bash
# Clone the repository
git clone https://github.com/Kotodian/calamity.git
cd calamity

# Install dependencies
npm install

# Start frontend dev server (localhost:1420)
npm run dev

# Start full desktop app (frontend + Tauri)
npm run tauri dev

# Build production bundle
npm run build

# Run tests
npm test                                          # Frontend (Vitest)
cargo test --manifest-path src-tauri/Cargo.toml   # Backend (Rust)
```

### Project Structure

```
calamity/                       # Cargo workspace root
├── src/                        # React/TypeScript frontend
│   ├── pages/                  # Dashboard, Nodes, Rules, DNS, Settings, etc.
│   ├── tray/                   # Compact tray window widgets
│   ├── stores/                 # Zustand state management
│   ├── services/               # Tauri command adapters
│   ├── components/             # Shared UI components (shadcn/ui)
│   ├── i18n/                   # English & Chinese translations
│   └── lib/                    # Utilities (flags, URI parsing, etc.)
├── calamity-core/              # Shared Rust library (platform-agnostic logic)
│   └── src/
│       ├── singbox/            # sing-box config, process, storage, APIs
│       ├── platform/           # Platform abstraction (macOS pf/networksetup, Linux nftables/gsettings)
│       └── ipc/                # Unix domain socket IPC
├── src-tauri/                  # Tauri + Rust backend (macOS GUI)
│   └── src/
│       ├── commands/           # Tauri command modules
│       └── ...
├── src-daemon/                 # calamityd — headless Linux daemon
├── src-cli/                    # calamity — CLI client
├── docs/                       # Documentation & screenshots
├── tailscale/                  # Tailscale integration resources
├── index.html                  # Main window entry
└── tray.html                   # Tray window entry
```

## Roadmap

- [x] TUN mode with Fake-IP
- [x] Tailscale native integration
- [x] Ruleset Market
- [x] DNS auto-detour generation
- [x] Concurrent subscription fetching
- [x] Gateway mode (transparent LAN proxy)
- [x] BGP rule sync between Calamity instances (Phase 1: manual pull)
- [ ] BGP rule sync Phase 2: auto-sync with persistent sessions
- [x] AI Auth Gateway (centralized AI API auth for LAN devices)
- [ ] Config hot-reload
- [ ] Versioned releases
- [x] Cross-platform CLI & headless daemon (Linux)
- [x] Linux support (deb, rpm, pacman, tarball — x86_64 & aarch64)
- [ ] MCP Server integration for AI-assisted proxy control

## Contributing

Contributions are welcome! Please read [AGENTS.md](./AGENTS.md) for repository conventions, coding style, and test expectations before submitting a PR.

## Acknowledgement

- [sing-box](https://github.com/SagerNet/sing-box) — The universal proxy platform
- [Tauri](https://tauri.app/) — Build smaller, faster, and more secure desktop applications
- [Clash Verge Rev](https://github.com/clash-verge-rev/clash-verge-rev) — Inspiration for UI/UX design
- [Tailscale](https://tailscale.com/) — Mesh VPN integration

## License

[MIT License](./LICENSE) © 2026 Kotodian
