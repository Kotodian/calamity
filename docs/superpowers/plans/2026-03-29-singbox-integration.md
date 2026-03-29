# sing-box Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the mock service layer with a real sing-box backend — process management, config generation, and Clash API proxy — starting with Logs.

**Architecture:** Rust backend manages a sing-box subprocess (binary bundled in .app). It generates sing-box JSON config from persisted user data (JSON files in app data dir). For dynamic operations (logs, traffic, connections, proxy switching), Rust proxies requests to sing-box's Clash API (`127.0.0.1:9090`). Frontend services switch from mock to `invoke()` calls. Streaming endpoints (logs, traffic) use Tauri events.

**Tech Stack:** Tauri v2, Rust (reqwest, tokio, serde), sing-box Clash API, TypeScript/React (existing frontend)

---

## File Structure

### Rust Backend (new files in `src-tauri/src/`)

| File | Responsibility |
|------|---------------|
| `src-tauri/src/lib.rs` | Modify: register commands, manage app state |
| `src-tauri/src/singbox/mod.rs` | Module root, re-exports |
| `src-tauri/src/singbox/process.rs` | sing-box subprocess lifecycle (spawn, kill, restart, health check) |
| `src-tauri/src/singbox/clash_api.rs` | HTTP client wrapper for Clash API endpoints |
| `src-tauri/src/singbox/config.rs` | Generate sing-box JSON config from app data |
| `src-tauri/src/singbox/storage.rs` | Read/write JSON files in app data directory |
| `src-tauri/src/commands/mod.rs` | Module root, re-exports |
| `src-tauri/src/commands/logs.rs` | Tauri commands for log streaming |
| `src-tauri/src/commands/connection.rs` | Tauri commands for connect/disconnect/status |

### Frontend (modify existing files)

| File | Change |
|------|--------|
| `src/services/logs.ts` | Add `tauriLogsService` implementation, export switcher |
| `src/services/connection.ts` | Add `tauriConnectionService` implementation |
| `src/stores/logs.ts` | Switch to Tauri event listener for streaming |

### Config

| File | Change |
|------|--------|
| `src-tauri/Cargo.toml` | Add reqwest, tokio, dirs dependencies |
| `src-tauri/tauri.conf.json` | Add externalBin for sing-box sidecar |
| `src-tauri/capabilities/default.json` | Add shell:allow-execute permission |

---

## Task 1: Add Rust Dependencies

**Files:**
- Modify: `src-tauri/Cargo.toml`

- [ ] **Step 1: Add required crates to Cargo.toml**

Replace the `[dependencies]` section in `src-tauri/Cargo.toml` with:

```toml
[dependencies]
tauri = { version = "2", features = ["tray-icon", "image-png", "macos-private-api"] }
tauri-plugin-shell = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
reqwest = { version = "0.12", features = ["json"] }
tokio = { version = "1", features = ["process", "io-util", "sync", "time"] }
dirs = "6"
log = "0.4"
```

- [ ] **Step 2: Verify it compiles**

Run: `cd src-tauri && cargo check`
Expected: compiles with no errors (warnings OK)

- [ ] **Step 3: Commit**

```bash
git add src-tauri/Cargo.toml
git commit -m "chore: add reqwest, tokio, dirs dependencies for sing-box integration"
```

---

## Task 2: sing-box Sidecar Setup

**Files:**
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src-tauri/capabilities/default.json`

The sing-box binary will be bundled as a Tauri sidecar. Tauri expects the binary at `src-tauri/binaries/sing-box-{target_triple}` (e.g., `sing-box-aarch64-apple-darwin`). At runtime, Tauri resolves the sidecar path automatically.

- [ ] **Step 1: Copy sing-box binary to sidecar location**

First, find your local sing-box binary and determine your target triple:

```bash
# Check architecture
rustc -vV | grep host
# Output: host: aarch64-apple-darwin (or x86_64-apple-darwin)

# Find sing-box
which sing-box || echo "Install sing-box first: brew install sing-box"
```

Then copy with the correct name:

```bash
mkdir -p src-tauri/binaries
cp "$(which sing-box)" src-tauri/binaries/sing-box-aarch64-apple-darwin
# If on Intel Mac, use: sing-box-x86_64-apple-darwin
```

- [ ] **Step 2: Add externalBin to tauri.conf.json**

Add `"externalBin"` to the `"bundle"` section in `src-tauri/tauri.conf.json`:

```json
{
  "bundle": {
    "active": true,
    "targets": "all",
    "externalBin": ["binaries/sing-box"],
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ]
  }
}
```

- [ ] **Step 3: Add shell:allow-execute permission**

Update `src-tauri/capabilities/default.json` to allow sidecar execution:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Capability for the main and tray windows",
  "windows": ["main", "tray"],
  "permissions": [
    "core:default",
    "core:window:allow-show",
    "core:window:allow-hide",
    "core:window:allow-set-focus",
    "core:window:allow-unminimize",
    "core:window:allow-is-visible",
    "core:window:allow-start-dragging",
    "shell:allow-open",
    "shell:allow-execute"
  ]
}
```

- [ ] **Step 4: Add binaries/ to .gitignore**

The sing-box binary is large (~30MB). Add to `.gitignore`:

```
src-tauri/binaries/
```

- [ ] **Step 5: Commit**

```bash
git add src-tauri/tauri.conf.json src-tauri/capabilities/default.json .gitignore
git commit -m "chore: configure sing-box sidecar bundle and shell permissions"
```

---

## Task 3: Storage Module — JSON File Persistence

**Files:**
- Create: `src-tauri/src/singbox/mod.rs`
- Create: `src-tauri/src/singbox/storage.rs`

- [ ] **Step 1: Create module structure**

Create `src-tauri/src/singbox/mod.rs`:

```rust
pub mod storage;
pub mod clash_api;
pub mod process;
pub mod config;
```

- [ ] **Step 2: Implement storage module**

Create `src-tauri/src/singbox/storage.rs`:

```rust
use serde::{de::DeserializeOwned, Serialize};
use std::fs;
use std::path::PathBuf;

/// Returns the app data directory: ~/Library/Application Support/com.calamity.app/
pub fn app_data_dir() -> PathBuf {
    let base = dirs::data_dir().expect("no data dir");
    let dir = base.join("com.calamity.app");
    fs::create_dir_all(&dir).expect("failed to create app data dir");
    dir
}

/// Read a JSON file from app data dir. Returns default if file doesn't exist.
pub fn read_json<T: DeserializeOwned + Default>(filename: &str) -> T {
    let path = app_data_dir().join(filename);
    match fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
        Err(_) => T::default(),
    }
}

/// Write a JSON file to app data dir.
pub fn write_json<T: Serialize>(filename: &str, data: &T) -> Result<(), String> {
    let path = app_data_dir().join(filename);
    let content = serde_json::to_string_pretty(data).map_err(|e| e.to_string())?;
    fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(())
}

/// Returns the path where sing-box config will be written.
pub fn singbox_config_path() -> PathBuf {
    app_data_dir().join("singbox-config.json")
}
```

- [ ] **Step 3: Verify it compiles**

Add `mod singbox;` to `src-tauri/src/lib.rs` (at the top, before `pub fn run()`):

```rust
mod singbox;
mod commands;
```

Also create stub `src-tauri/src/commands/mod.rs`:

```rust
pub mod logs;
pub mod connection;
```

And stub `src-tauri/src/commands/logs.rs`:

```rust
// Will be implemented in Task 6
```

And stub `src-tauri/src/commands/connection.rs`:

```rust
// Will be implemented in Task 8
```

Run: `cd src-tauri && cargo check`
Expected: compiles (warnings about unused modules OK)

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/singbox/ src-tauri/src/commands/
git commit -m "feat: storage module for JSON file persistence"
```

---

## Task 4: Clash API Client

**Files:**
- Create: `src-tauri/src/singbox/clash_api.rs`

This module wraps all HTTP calls to sing-box's Clash API at `http://127.0.0.1:9090`.

- [ ] **Step 1: Implement Clash API client**

Create `src-tauri/src/singbox/clash_api.rs`:

```rust
use reqwest::Client;
use serde::Deserialize;

const BASE_URL: &str = "http://127.0.0.1:9090";

pub struct ClashApi {
    client: Client,
}

#[derive(Debug, Deserialize)]
pub struct LogMessage {
    #[serde(rename = "type")]
    pub level: String,
    pub payload: String,
}

#[derive(Debug, Deserialize)]
pub struct TrafficData {
    pub up: u64,
    pub down: u64,
}

#[derive(Debug, Deserialize)]
pub struct ConnectionsSnapshot {
    #[serde(rename = "downloadTotal")]
    pub download_total: u64,
    #[serde(rename = "uploadTotal")]
    pub upload_total: u64,
    pub connections: Vec<ConnectionEntry>,
    pub memory: u64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ConnectionEntry {
    pub id: String,
    pub metadata: ConnectionMetadata,
    pub upload: u64,
    pub download: u64,
    pub start: String,
    pub chains: Vec<String>,
    pub rule: String,
    #[serde(rename = "rulePayload")]
    pub rule_payload: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ConnectionMetadata {
    pub network: String,
    #[serde(rename = "type")]
    pub conn_type: String,
    #[serde(rename = "sourceIP")]
    pub source_ip: String,
    #[serde(rename = "destinationIP")]
    pub destination_ip: String,
    #[serde(rename = "sourcePort")]
    pub source_port: String,
    #[serde(rename = "destinationPort")]
    pub destination_port: String,
    pub host: String,
    #[serde(rename = "processPath", default)]
    pub process_path: String,
}

#[derive(Debug, Deserialize)]
pub struct VersionInfo {
    pub version: String,
}

impl ClashApi {
    pub fn new() -> Self {
        Self {
            client: Client::new(),
        }
    }

    /// Health check: GET /
    pub async fn health_check(&self) -> Result<bool, String> {
        let resp = self
            .client
            .get(format!("{}/", BASE_URL))
            .send()
            .await
            .map_err(|e| e.to_string())?;
        Ok(resp.status().is_success())
    }

    /// GET /version
    pub async fn version(&self) -> Result<VersionInfo, String> {
        self.client
            .get(format!("{}/version", BASE_URL))
            .send()
            .await
            .map_err(|e| e.to_string())?
            .json()
            .await
            .map_err(|e| e.to_string())
    }

    /// GET /connections (snapshot, not streaming)
    pub async fn get_connections(&self) -> Result<ConnectionsSnapshot, String> {
        self.client
            .get(format!("{}/connections", BASE_URL))
            .send()
            .await
            .map_err(|e| e.to_string())?
            .json()
            .await
            .map_err(|e| e.to_string())
    }

    /// DELETE /connections/{id}
    pub async fn close_connection(&self, id: &str) -> Result<(), String> {
        self.client
            .delete(format!("{}/connections/{}", BASE_URL, id))
            .send()
            .await
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    /// DELETE /connections (close all)
    pub async fn close_all_connections(&self) -> Result<(), String> {
        self.client
            .delete(format!("{}/connections", BASE_URL))
            .send()
            .await
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    /// PUT /proxies/{group} — switch active proxy in a selector group
    pub async fn switch_proxy(&self, group: &str, node: &str) -> Result<(), String> {
        let resp = self
            .client
            .put(format!("{}/proxies/{}", BASE_URL, group))
            .json(&serde_json::json!({"name": node}))
            .send()
            .await
            .map_err(|e| e.to_string())?;
        if resp.status().is_success() {
            Ok(())
        } else {
            Err(format!("switch_proxy failed: {}", resp.status()))
        }
    }

    /// GET /proxies/{name}/delay — test proxy latency
    pub async fn test_delay(&self, name: &str, url: &str, timeout: u32) -> Result<u32, String> {
        #[derive(Deserialize)]
        struct DelayResp {
            delay: u32,
        }
        let resp: DelayResp = self
            .client
            .get(format!(
                "{}/proxies/{}/delay?url={}&timeout={}",
                BASE_URL, name, url, timeout
            ))
            .send()
            .await
            .map_err(|e| e.to_string())?
            .json()
            .await
            .map_err(|e| e.to_string())?;
        Ok(resp.delay)
    }

    /// PATCH /configs — change mode (Rule/Direct/Global)
    pub async fn set_mode(&self, mode: &str) -> Result<(), String> {
        self.client
            .patch(format!("{}/configs", BASE_URL))
            .json(&serde_json::json!({"mode": mode}))
            .send()
            .await
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    /// Read one line from the /logs streaming endpoint (non-WebSocket, chunked HTTP).
    /// Returns the raw response for streaming by the caller.
    pub async fn logs_stream(
        &self,
        level: &str,
    ) -> Result<reqwest::Response, String> {
        self.client
            .get(format!("{}/logs?level={}", BASE_URL, level))
            .send()
            .await
            .map_err(|e| e.to_string())
    }

    /// GET /traffic streaming response
    pub async fn traffic_stream(&self) -> Result<reqwest::Response, String> {
        self.client
            .get(format!("{}/traffic", BASE_URL))
            .send()
            .await
            .map_err(|e| e.to_string())
    }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd src-tauri && cargo check`
Expected: compiles

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/singbox/clash_api.rs
git commit -m "feat: Clash API HTTP client for sing-box"
```

---

## Task 5: Process Manager

**Files:**
- Create: `src-tauri/src/singbox/process.rs`
- Create: `src-tauri/src/singbox/config.rs`

- [ ] **Step 1: Implement minimal config generator**

Create `src-tauri/src/singbox/config.rs`. For now, generate a minimal config that starts sing-box with Clash API enabled and basic inbounds:

```rust
use serde_json::{json, Value};

use super::storage;

/// Generate a minimal sing-box config with Clash API enabled.
/// This will be expanded later to include nodes, rules, DNS from persisted data.
pub fn generate_minimal_config(log_level: &str, mixed_port: u16) -> Value {
    json!({
        "log": {
            "level": log_level,
            "timestamp": true
        },
        "dns": {
            "servers": [
                {
                    "tag": "cloudflare",
                    "address": "https://1.1.1.1/dns-query",
                    "detour": "direct-out"
                },
                {
                    "tag": "local",
                    "address": "223.5.5.5",
                    "detour": "direct-out"
                }
            ],
            "rules": [
                {
                    "domain_suffix": [".cn"],
                    "server": "local"
                }
            ]
        },
        "inbounds": [
            {
                "type": "mixed",
                "tag": "mixed-in",
                "listen": "127.0.0.1",
                "listen_port": mixed_port
            }
        ],
        "outbounds": [
            {
                "type": "direct",
                "tag": "direct-out"
            },
            {
                "type": "block",
                "tag": "block-out"
            }
        ],
        "route": {
            "auto_detect_interface": true,
            "final": "direct-out"
        },
        "experimental": {
            "clash_api": {
                "external_controller": "127.0.0.1:9090",
                "default_mode": "Rule"
            }
        }
    })
}

/// Write the config to the app data directory and return the path.
pub fn write_config(log_level: &str, mixed_port: u16) -> Result<String, String> {
    let config = generate_minimal_config(log_level, mixed_port);
    let path = storage::singbox_config_path();
    let content = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    std::fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}
```

- [ ] **Step 2: Implement process manager**

Create `src-tauri/src/singbox/process.rs`:

```rust
use std::sync::Arc;
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

use super::clash_api::ClashApi;
use super::config;

pub struct SingboxProcess {
    child: Arc<Mutex<Option<Child>>>,
    api: ClashApi,
    singbox_path: String,
}

impl SingboxProcess {
    pub fn new(singbox_path: String) -> Self {
        Self {
            child: Arc::new(Mutex::new(None)),
            api: ClashApi::new(),
            singbox_path,
        }
    }

    pub fn api(&self) -> &ClashApi {
        &self.api
    }

    /// Start the sing-box process with a generated config.
    pub async fn start(&self, log_level: &str, mixed_port: u16) -> Result<(), String> {
        // Generate and write config
        let config_path = config::write_config(log_level, mixed_port)?;

        // Kill existing process if any
        self.stop().await?;

        // Spawn sing-box
        let child = Command::new(&self.singbox_path)
            .arg("run")
            .arg("-c")
            .arg(&config_path)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| format!("failed to spawn sing-box: {}", e))?;

        *self.child.lock().await = Some(child);

        // Wait for Clash API to become available (up to 5 seconds)
        for _ in 0..50 {
            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
            if self.api.health_check().await.unwrap_or(false) {
                return Ok(());
            }
        }

        Err("sing-box started but Clash API not responding after 5s".to_string())
    }

    /// Stop the sing-box process.
    pub async fn stop(&self) -> Result<(), String> {
        let mut guard = self.child.lock().await;
        if let Some(ref mut child) = *guard {
            child.kill().await.map_err(|e| e.to_string())?;
            child.wait().await.map_err(|e| e.to_string())?;
        }
        *guard = None;
        Ok(())
    }

    /// Restart: stop then start.
    pub async fn restart(&self, log_level: &str, mixed_port: u16) -> Result<(), String> {
        self.stop().await?;
        self.start(log_level, mixed_port).await
    }

    /// Check if process is running.
    pub async fn is_running(&self) -> bool {
        let guard = self.child.lock().await;
        guard.is_some()
    }
}
```

- [ ] **Step 3: Verify it compiles**

Run: `cd src-tauri && cargo check`
Expected: compiles

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/singbox/config.rs src-tauri/src/singbox/process.rs
git commit -m "feat: sing-box process manager and minimal config generator"
```

---

## Task 6: Log Streaming — Rust Commands

**Files:**
- Modify: `src-tauri/src/commands/logs.rs`
- Modify: `src-tauri/src/lib.rs`

Log streaming works like this: frontend calls `invoke("start_log_stream")`, Rust opens a chunked HTTP connection to `GET /logs?level=...`, reads lines, and emits Tauri events (`singbox://log`) that the frontend listens to.

- [ ] **Step 1: Implement log commands**

Replace `src-tauri/src/commands/logs.rs` with:

```rust
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

use crate::singbox::clash_api::LogMessage;
use crate::singbox::process::SingboxProcess;

#[derive(Clone, Serialize)]
pub struct LogEvent {
    pub level: String,
    pub message: String,
    pub timestamp: String,
    pub source: String,
}

fn parse_log_source(payload: &str) -> (String, String) {
    // sing-box log format: "component: message"
    if let Some(idx) = payload.find(": ") {
        (payload[..idx].to_string(), payload[idx + 2..].to_string())
    } else {
        ("system".to_string(), payload.to_string())
    }
}

fn now_timestamp() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    format!("{}", now)
}

#[tauri::command]
pub async fn start_log_stream(app: AppHandle, level: String) -> Result<(), String> {
    let process = app.state::<std::sync::Arc<SingboxProcess>>().inner().clone();

    let response = process.api().logs_stream(&level).await?;

    // Spawn a task that reads chunked response line by line
    tokio::spawn(async move {
        let mut response = response;
        let mut buffer = String::new();

        loop {
            match response.chunk().await {
                Ok(Some(chunk)) => {
                    let text = String::from_utf8_lossy(&chunk);
                    buffer.push_str(&text);

                    // Process complete lines
                    while let Some(newline_pos) = buffer.find('\n') {
                        let line = buffer[..newline_pos].trim().to_string();
                        buffer = buffer[newline_pos + 1..].to_string();

                        if line.is_empty() {
                            continue;
                        }

                        if let Ok(msg) = serde_json::from_str::<LogMessage>(&line) {
                            let (source, message) = parse_log_source(&msg.payload);
                            let event = LogEvent {
                                level: msg.level,
                                message,
                                timestamp: now_timestamp(),
                                source,
                            };
                            let _ = app.emit("singbox://log", &event);
                        }
                    }
                }
                Ok(None) => break,   // Stream ended
                Err(_) => break,     // Connection error
            }
        }
    });

    Ok(())
}
```

- [ ] **Step 2: Register commands and app state in lib.rs**

Replace `src-tauri/src/lib.rs` with:

```rust
use std::sync::Arc;
use tauri::{
    image::Image,
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

mod commands;
mod singbox;

use singbox::process::SingboxProcess;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Determine sing-box binary path
            // In dev: use system sing-box; in prod: use bundled sidecar
            let singbox_path = if cfg!(debug_assertions) {
                // Dev mode: try to find sing-box in PATH
                "sing-box".to_string()
            } else {
                // Production: use sidecar from bundle
                app.path()
                    .resource_dir()
                    .map(|d| d.join("binaries").join("sing-box").to_string_lossy().to_string())
                    .unwrap_or_else(|_| "sing-box".to_string())
            };

            let process = Arc::new(SingboxProcess::new(singbox_path));
            app.manage(process.clone());

            // Start sing-box on launch
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let process = app_handle.state::<Arc<SingboxProcess>>();
                if let Err(e) = process.start("info", 7892).await {
                    eprintln!("Failed to start sing-box: {}", e);
                }
            });

            // Tray icon setup
            let icon = Image::from_bytes(include_bytes!("../icons/icon.png"))
                .expect("failed to load tray icon");

            let _tray = TrayIconBuilder::new()
                .icon(icon)
                .icon_as_template(true)
                .tooltip("Calamity")
                .on_tray_icon_event(|tray, event| match event {
                    TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        position,
                        ..
                    } => {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("tray") {
                            let visible = window.is_visible().unwrap_or(false);
                            if visible {
                                let _ = window.hide();
                            } else {
                                let logical_w = 288.0_f64;
                                let logical_h = 420.0_f64;

                                let scale = window.scale_factor().unwrap_or(2.0);
                                let logical_x = position.x / scale - logical_w / 2.0;
                                let logical_y = position.y / scale;

                                let _ = window
                                    .set_size(tauri::LogicalSize::new(logical_w, logical_h));
                                let _ = window.set_position(tauri::LogicalPosition::new(
                                    logical_x, logical_y,
                                ));
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                    _ => {}
                })
                .build(app)?;

            // Main window: intercept close to hide instead of destroy
            if let Some(main_window) = app.get_webview_window("main") {
                let main_clone = main_window.clone();
                main_window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = main_clone.hide();
                    }
                });
            }

            // Hide tray window when it loses focus
            if let Some(tray_window) = app.get_webview_window("tray") {
                let tray_window_clone = tray_window.clone();
                tray_window.on_window_event(move |event| {
                    if let tauri::WindowEvent::Focused(false) = event {
                        let _ = tray_window_clone.hide();
                    }
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::logs::start_log_stream,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 3: Verify it compiles**

Run: `cd src-tauri && cargo check`
Expected: compiles

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands/logs.rs src-tauri/src/lib.rs
git commit -m "feat: log streaming commands via Tauri events"
```

---

## Task 7: Frontend — Log Service Tauri Implementation

**Files:**
- Modify: `src/services/logs.ts`
- Modify: `src/stores/logs.ts`

- [ ] **Step 1: Write the failing test for log event parsing**

Create `src/lib/__tests__/log-event.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { parseLogEvent } from "../log-event";

describe("parseLogEvent", () => {
  it("parses a log event payload into LogEntry", () => {
    const event = {
      level: "info",
      message: "matched rule: domain-suffix(google.com) => Proxy",
      timestamp: "1711700000000",
      source: "router",
    };
    const entry = parseLogEvent(event);
    expect(entry.level).toBe("info");
    expect(entry.source).toBe("router");
    expect(entry.message).toBe("matched rule: domain-suffix(google.com) => Proxy");
    expect(entry.id).toBeTruthy();
    expect(entry.timestamp).toBeTruthy();
  });

  it("maps warn level correctly", () => {
    const event = {
      level: "warning",
      message: "timeout",
      timestamp: "1711700000000",
      source: "outbound",
    };
    const entry = parseLogEvent(event);
    expect(entry.level).toBe("warn");
  });

  it("defaults unknown level to info", () => {
    const event = {
      level: "trace",
      message: "something",
      timestamp: "1711700000000",
      source: "system",
    };
    const entry = parseLogEvent(event);
    expect(entry.level).toBe("info");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/__tests__/log-event.test.ts`
Expected: FAIL — `parseLogEvent` doesn't exist

- [ ] **Step 3: Implement parseLogEvent**

Create `src/lib/log-event.ts`:

```typescript
import type { LogEntry, LogLevel } from "../services/types";

export interface RawLogEvent {
  level: string;
  message: string;
  timestamp: string;
  source: string;
}

let logCounter = 0;

const LEVEL_MAP: Record<string, LogLevel> = {
  debug: "debug",
  info: "info",
  warn: "warn",
  warning: "warn",
  error: "error",
};

export function parseLogEvent(event: RawLogEvent): LogEntry {
  return {
    id: `log-${Date.now()}-${logCounter++}`,
    timestamp: new Date(Number(event.timestamp) || Date.now()).toISOString(),
    level: LEVEL_MAP[event.level] ?? "info",
    source: event.source,
    message: event.message,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/__tests__/log-event.test.ts`
Expected: PASS

- [ ] **Step 5: Add Tauri logs service implementation**

Modify `src/services/logs.ts`. Keep the mock service and add a Tauri-backed one. The export switches based on environment:

```typescript
import type { LogEntry, LogLevel } from "./types";
import { parseLogEvent, type RawLogEvent } from "../lib/log-event";

export interface LogsService {
  getLogs(level?: LogLevel): Promise<LogEntry[]>;
  clearLogs(): Promise<void>;
  subscribeLogs(callback: (entry: LogEntry) => void): () => void;
}

// ---- Mock Implementation (dev) ----

const sampleMessages = [
  { level: "info" as LogLevel, source: "router", message: "matched rule: domain-suffix(google.com) => Proxy: Tokyo 01" },
  { level: "info" as LogLevel, source: "router", message: "matched rule: geosite(cn) => DIRECT" },
  { level: "debug" as LogLevel, source: "dns", message: "resolve github.com => fake-ip 198.18.0.42" },
  { level: "warn" as LogLevel, source: "outbound", message: "proxy Tokyo 02 health check failed, latency timeout" },
  { level: "info" as LogLevel, source: "inbound", message: "accepted connection from 127.0.0.1:52341" },
  { level: "error" as LogLevel, source: "outbound", message: "dial tcp 203.0.113.1:443: connection refused" },
  { level: "info" as LogLevel, source: "tun", message: "capture DNS query: api.github.com A" },
  { level: "debug" as LogLevel, source: "router", message: "sniffed TLS host: www.google.com" },
];

let mockLogs: LogEntry[] = [];
let logId = 0;

function generateLog(): LogEntry {
  const sample = sampleMessages[Math.floor(Math.random() * sampleMessages.length)];
  return {
    id: `log-${logId++}`,
    timestamp: new Date().toISOString(),
    ...sample,
  };
}

// Pre-populate
for (let i = 0; i < 50; i++) {
  mockLogs.push(generateLog());
}

const mockLogsService: LogsService = {
  async getLogs(level?) {
    const logs = level ? mockLogs.filter((l) => l.level === level) : mockLogs;
    return logs.map((l) => ({ ...l }));
  },
  async clearLogs() {
    mockLogs = [];
  },
  subscribeLogs(callback) {
    const interval = setInterval(() => {
      const entry = generateLog();
      mockLogs.push(entry);
      if (mockLogs.length > 500) mockLogs = mockLogs.slice(-500);
      callback(entry);
    }, 2000);
    return () => clearInterval(interval);
  },
};

// ---- Tauri Implementation (prod) ----

function createTauriLogsService(): LogsService {
  return {
    async getLogs() {
      return [];
    },
    async clearLogs() {
      // No-op on backend; frontend clears its local array.
    },
    subscribeLogs(callback) {
      let unlistenFn: (() => void) | null = null;
      let stopped = false;

      (async () => {
        const { invoke } = await import("@tauri-apps/api/core");
        const { listen } = await import("@tauri-apps/api/event");

        if (stopped) return;

        // Start the log stream on the Rust side
        await invoke("start_log_stream", { level: "debug" });

        // Listen for emitted log events
        unlistenFn = await listen<RawLogEvent>("singbox://log", (event) => {
          const entry = parseLogEvent(event.payload);
          callback(entry);
        });
      })();

      return () => {
        stopped = true;
        if (unlistenFn) unlistenFn();
      };
    },
  };
}

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
export const logsService: LogsService = isTauri ? createTauriLogsService() : mockLogsService;
```

- [ ] **Step 6: Run all tests**

Run: `npm test`
Expected: all existing tests still pass. The mock service is used during tests (no `__TAURI_INTERNALS__`).

- [ ] **Step 7: Commit**

```bash
git add src/lib/log-event.ts src/lib/__tests__/log-event.test.ts src/services/logs.ts
git commit -m "feat: Tauri log service with event streaming from sing-box"
```

---

## Task 8: Connection Commands — Start/Stop sing-box

**Files:**
- Modify: `src-tauri/src/commands/connection.rs`
- Modify: `src-tauri/src/lib.rs` (register new commands)

- [ ] **Step 1: Implement connection commands**

Replace `src-tauri/src/commands/connection.rs` with:

```rust
use std::sync::Arc;
use serde::Serialize;
use tauri::{AppHandle, Manager};

use crate::singbox::process::SingboxProcess;

#[derive(Clone, Serialize)]
pub struct SingboxStatus {
    pub running: bool,
    pub version: String,
}

#[tauri::command]
pub async fn singbox_start(app: AppHandle) -> Result<(), String> {
    let process = app.state::<Arc<SingboxProcess>>().inner().clone();
    process.start("info", 7892).await
}

#[tauri::command]
pub async fn singbox_stop(app: AppHandle) -> Result<(), String> {
    let process = app.state::<Arc<SingboxProcess>>().inner().clone();
    process.stop().await
}

#[tauri::command]
pub async fn singbox_restart(app: AppHandle) -> Result<(), String> {
    let process = app.state::<Arc<SingboxProcess>>().inner().clone();
    process.restart("info", 7892).await
}

#[tauri::command]
pub async fn singbox_status(app: AppHandle) -> Result<SingboxStatus, String> {
    let process = app.state::<Arc<SingboxProcess>>().inner().clone();
    let running = process.is_running().await;
    let version = if running {
        process
            .api()
            .version()
            .await
            .map(|v| v.version)
            .unwrap_or_else(|_| "unknown".to_string())
    } else {
        "not running".to_string()
    };
    Ok(SingboxStatus { running, version })
}
```

- [ ] **Step 2: Register commands in lib.rs**

In `src-tauri/src/lib.rs`, update the `invoke_handler` to include the new commands:

```rust
        .invoke_handler(tauri::generate_handler![
            commands::logs::start_log_stream,
            commands::connection::singbox_start,
            commands::connection::singbox_stop,
            commands::connection::singbox_restart,
            commands::connection::singbox_status,
        ])
```

- [ ] **Step 3: Verify it compiles**

Run: `cd src-tauri && cargo check`
Expected: compiles

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands/connection.rs src-tauri/src/lib.rs
git commit -m "feat: sing-box start/stop/restart/status commands"
```

---

## Task 9: Integration Test — End-to-End Log Streaming

**Files:**
- No new files. Manual verification.

- [ ] **Step 1: Ensure sing-box is installed**

```bash
which sing-box || brew install sing-box
sing-box version
```

- [ ] **Step 2: Start the app**

```bash
# Kill any existing dev server
lsof -ti:1420 | xargs kill -9 2>/dev/null
npm run tauri dev
```

- [ ] **Step 3: Verify sing-box starts**

Check the terminal output for:
- No "Failed to start sing-box" error
- sing-box process running: `pgrep -f sing-box`

- [ ] **Step 4: Verify Clash API is reachable**

```bash
curl http://127.0.0.1:9090/version
```

Expected: `{"version":"sing-box X.X.X",...}`

- [ ] **Step 5: Verify log streaming in the UI**

1. Navigate to the Logs page
2. Verify logs appear in real-time (from sing-box, not mock data)
3. Test level filtering (Debug/Info/Warn/Error tabs)
4. Test search filtering
5. Test Clear button

- [ ] **Step 6: Verify sidebar version shows real version**

The sidebar currently hardcodes "SingBox Core v1.8.4". After integration, it should show the real version. This is a nice-to-have for a future task.

- [ ] **Step 7: Commit any fixes from integration testing**

```bash
git add -A
git commit -m "fix: integration test fixes for sing-box log streaming"
```

---

## Task 10: Graceful Shutdown

**Files:**
- Modify: `src-tauri/src/lib.rs`

When Calamity quits (Cmd+Q or force quit), sing-box must be killed.

- [ ] **Step 1: Add shutdown hook**

In `src-tauri/src/lib.rs`, add an `on_event` handler after `.invoke_handler(...)` and before `.run(...)`:

First, change `.run(...)` to use a closure that handles the `RunEvent::Exit`:

```rust
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                let process = app.state::<std::sync::Arc<SingboxProcess>>();
                // Block on stopping sing-box
                tauri::async_runtime::block_on(async {
                    let _ = process.stop().await;
                });
            }
        });
```

Note: this replaces the previous `.run(tauri::generate_context!()).expect(...)` pattern. The builder now uses `.build()` + `.run()` separately.

- [ ] **Step 2: Verify it compiles**

Run: `cd src-tauri && cargo check`
Expected: compiles

- [ ] **Step 3: Test shutdown**

1. Start the app: `npm run tauri dev`
2. Verify sing-box is running: `pgrep -f sing-box`
3. Quit the app (Cmd+Q)
4. Verify sing-box is stopped: `pgrep -f sing-box` (should return nothing)

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat: graceful sing-box shutdown on app exit"
```
