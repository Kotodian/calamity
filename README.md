# Calamity

Calamity is a macOS desktop proxy client built with Tauri, React, and sing-box. It combines a full dashboard with a compact tray interface for daily proxy operations, rule management, DNS control, and node switching.

## Highlights

- React + Vite frontend with a separate tray webview
- Tauri + Rust backend for native process control and system integration
- sing-box integration for proxy routing, rules, DNS, and TUN mode
- Rule-based routing, final outbound selection, and per-site quick actions
- DNS management with Fake-IP support for TUN mode
- Tailnet page for Tailscale-related controls
- English and Simplified Chinese UI

## Project Layout

- `src/`: frontend app, tray UI, stores, services, i18n, and tests
- `src/pages/`: dashboard, nodes, rules, DNS, logs, settings, subscriptions, connections, tailnet
- `src/tray/`: compact tray widgets and quick actions
- `src/stores/`: Zustand stores for connection, settings, rules, and other app state
- `src/services/`: frontend adapters for Tauri commands and mock implementations for tests
- `src-tauri/src/`: Rust commands, sing-box config generation, storage, and native integrations
- `.github/workflows/manual-release.yml`: manual GitHub Actions packaging workflow for Apple Silicon builds

## Requirements

- macOS
- Node.js 20+
- Rust toolchain
- Tauri CLI
- `sing-box` available in `PATH` for local debug runs

## Development

Install dependencies:

```bash
npm install
```

Start the frontend only:

```bash
npm run dev
```

Start the desktop app:

```bash
npm run tauri dev
```

Build the frontend bundle:

```bash
npm run build
```

Run tests:

```bash
npm test
cargo test --manifest-path src-tauri/Cargo.toml
```

## TUN Mode Notes

- TUN mode is currently macOS-focused.
- Starting TUN requires administrator privileges.
- Fake-IP is enforced at runtime when TUN mode is enabled.
- The app attempts to fully stop the privileged sing-box process on quit so the TUN interface is released.

## Release Workflow

This repository includes a manual GitHub Actions workflow for packaging releases:

- Workflow: `Manual Tauri Release`
- Trigger: `workflow_dispatch`
- Target: `aarch64-apple-darwin`

## Contributing

See [AGENTS.md](./AGENTS.md) for repository-specific contributor guidelines, coding conventions, and test expectations.
