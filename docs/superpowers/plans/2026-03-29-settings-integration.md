# Settings Persistence + sing-box Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist app settings to JSON file and wire them into sing-box config generation, so changing ports/logLevel/allowLan actually takes effect.

**Architecture:** Rust `AppSettings` struct mirrors the frontend type. On startup, load from `settings.json` (or use defaults). On update, write to disk, regenerate sing-box config, and restart. Frontend services switch from mock to `invoke()`. TUN/systemProxy/autoStart are stored but not wired to sing-box yet.

**Tech Stack:** Tauri v2, Rust (serde), TypeScript (existing frontend)

---

## File Structure

| File | Change |
|------|--------|
| `src-tauri/src/singbox/storage.rs` | Add `read_json` / `write_json` back |
| `src-tauri/src/singbox/config.rs` | Accept `AppSettings` struct instead of loose params |
| `src-tauri/src/singbox/process.rs` | `start`/`restart` accept `&AppSettings` |
| `src-tauri/src/commands/settings.rs` | New: `get_settings` / `update_settings` commands |
| `src-tauri/src/commands/mod.rs` | Add `pub mod settings;` |
| `src-tauri/src/lib.rs` | Register new commands, load settings on startup |
| `src/services/settings.ts` | Add Tauri implementation with `isTauri` switch |

---

## Task 1: Rust AppSettings Type + Storage

**Files:**
- Modify: `src-tauri/src/singbox/storage.rs`

- [ ] **Step 1: Add read_json / write_json and AppSettings struct**

Replace `src-tauri/src/singbox/storage.rs` with:

```rust
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

pub fn app_data_dir() -> PathBuf {
    let base = dirs::data_dir().expect("no data dir");
    let dir = base.join("com.calamity.app");
    fs::create_dir_all(&dir).expect("failed to create app data dir");
    dir
}

pub fn singbox_config_path() -> PathBuf {
    app_data_dir().join("singbox-config.json")
}

pub fn read_json<T: DeserializeOwned + Default>(filename: &str) -> T {
    let path = app_data_dir().join(filename);
    match fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
        Err(_) => T::default(),
    }
}

pub fn write_json<T: Serialize>(filename: &str, data: &T) -> Result<(), String> {
    let path = app_data_dir().join(filename);
    let content = serde_json::to_string_pretty(data).map_err(|e| e.to_string())?;
    fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TunConfig {
    pub stack: String,
    pub mtu: u16,
    pub auto_route: bool,
    pub strict_route: bool,
    pub dns_hijack: Vec<String>,
}

impl Default for TunConfig {
    fn default() -> Self {
        Self {
            stack: "system".to_string(),
            mtu: 9000,
            auto_route: true,
            strict_route: false,
            dns_hijack: vec!["198.18.0.2:53".to_string()],
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub theme: String,
    pub singbox_path: String,
    pub auto_start: bool,
    pub system_proxy: bool,
    pub enhanced_mode: bool,
    pub tun_config: TunConfig,
    pub allow_lan: bool,
    pub http_port: u16,
    pub socks_port: u16,
    pub mixed_port: u16,
    pub log_level: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: "dark".to_string(),
            singbox_path: "sing-box".to_string(),
            auto_start: false,
            system_proxy: true,
            enhanced_mode: false,
            tun_config: TunConfig::default(),
            allow_lan: false,
            http_port: 7890,
            socks_port: 7891,
            mixed_port: 7893,
            log_level: "info".to_string(),
        }
    }
}

const SETTINGS_FILE: &str = "settings.json";

pub fn load_settings() -> AppSettings {
    read_json(SETTINGS_FILE)
}

pub fn save_settings(settings: &AppSettings) -> Result<(), String> {
    write_json(SETTINGS_FILE, settings)
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd src-tauri && cargo check`
Expected: compiles

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/singbox/storage.rs
git commit -m "feat: AppSettings type with JSON persistence"
```

---

## Task 2: Config Generator Uses AppSettings

**Files:**
- Modify: `src-tauri/src/singbox/config.rs`

- [ ] **Step 1: Refactor config generation to use AppSettings**

Replace `src-tauri/src/singbox/config.rs` with:

```rust
use serde_json::{json, Value};

use super::storage::{self, AppSettings};

pub fn generate_config(settings: &AppSettings) -> Value {
    let listen = if settings.allow_lan { "0.0.0.0" } else { "127.0.0.1" };

    let mut inbounds = vec![
        json!({
            "type": "mixed",
            "tag": "mixed-in",
            "listen": listen,
            "listen_port": settings.mixed_port
        }),
    ];

    if settings.http_port > 0 {
        inbounds.push(json!({
            "type": "http",
            "tag": "http-in",
            "listen": listen,
            "listen_port": settings.http_port
        }));
    }

    if settings.socks_port > 0 {
        inbounds.push(json!({
            "type": "socks",
            "tag": "socks-in",
            "listen": listen,
            "listen_port": settings.socks_port
        }));
    }

    json!({
        "log": {
            "level": settings.log_level,
            "timestamp": true
        },
        "dns": {
            "servers": [
                {
                    "type": "https",
                    "tag": "cloudflare",
                    "server": "1.1.1.1",
                    "server_port": 443,
                    "path": "/dns-query"
                },
                {
                    "type": "udp",
                    "tag": "local",
                    "server": "223.5.5.5"
                }
            ],
            "rules": [
                {
                    "domain_suffix": [".cn"],
                    "server": "local"
                }
            ]
        },
        "inbounds": inbounds,
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
            "final": "direct-out",
            "default_domain_resolver": {
                "server": "local"
            }
        },
        "experimental": {
            "clash_api": {
                "external_controller": "127.0.0.1:9091",
                "default_mode": "Rule"
            }
        }
    })
}

pub fn write_config(settings: &AppSettings) -> Result<String, String> {
    let config = generate_config(settings);
    let path = storage::singbox_config_path();
    let content = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    std::fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd src-tauri && cargo check`
Expected: compile error in process.rs (signature changed) — that's expected, fix in next task

---

## Task 3: Process Manager Uses AppSettings

**Files:**
- Modify: `src-tauri/src/singbox/process.rs`

- [ ] **Step 1: Refactor process to use AppSettings**

Replace `src-tauri/src/singbox/process.rs` with:

```rust
use std::sync::Arc;
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

use super::clash_api::ClashApi;
use super::config;
use super::storage::AppSettings;

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

    pub async fn start(&self, settings: &AppSettings) -> Result<(), String> {
        let config_path = config::write_config(settings)?;
        self.stop().await?;

        eprintln!("[singbox] spawning: {} run -c {}", &self.singbox_path, &config_path);

        let child = Command::new(&self.singbox_path)
            .arg("run")
            .arg("-c")
            .arg(&config_path)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::inherit())
            .spawn()
            .map_err(|e| format!("failed to spawn sing-box: {}", e))?;

        *self.child.lock().await = Some(child);

        for _ in 0..50 {
            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
            if self.api.health_check().await.unwrap_or(false) {
                return Ok(());
            }
        }

        Err("sing-box started but Clash API not responding after 5s".to_string())
    }

    pub async fn stop(&self) -> Result<(), String> {
        let mut guard = self.child.lock().await;
        if let Some(ref mut child) = *guard {
            child.kill().await.map_err(|e| e.to_string())?;
            child.wait().await.map_err(|e| e.to_string())?;
        }
        *guard = None;
        Ok(())
    }

    pub async fn restart(&self, settings: &AppSettings) -> Result<(), String> {
        self.stop().await?;
        self.start(settings).await
    }

    pub async fn is_running(&self) -> bool {
        let guard = self.child.lock().await;
        guard.is_some()
    }
}
```

- [ ] **Step 2: Update connection commands to use AppSettings**

Replace `src-tauri/src/commands/connection.rs` with:

```rust
use std::sync::Arc;
use serde::Serialize;
use tauri::{AppHandle, Manager};

use crate::singbox::process::SingboxProcess;
use crate::singbox::storage;

#[derive(Clone, Serialize)]
pub struct SingboxStatus {
    pub running: bool,
    pub version: String,
}

#[tauri::command]
pub async fn singbox_start(app: AppHandle) -> Result<(), String> {
    let process = app.state::<Arc<SingboxProcess>>().inner().clone();
    let settings = storage::load_settings();
    process.start(&settings).await
}

#[tauri::command]
pub async fn singbox_stop(app: AppHandle) -> Result<(), String> {
    let process = app.state::<Arc<SingboxProcess>>().inner().clone();
    process.stop().await
}

#[tauri::command]
pub async fn singbox_restart(app: AppHandle) -> Result<(), String> {
    let process = app.state::<Arc<SingboxProcess>>().inner().clone();
    let settings = storage::load_settings();
    process.restart(&settings).await
}

#[tauri::command]
pub async fn singbox_status(app: AppHandle) -> Result<SingboxStatus, String> {
    let process = app.state::<Arc<SingboxProcess>>().inner().clone();
    let running = process.is_running().await;
    let version = if running {
        process.api().version().await.map(|v| v.version).unwrap_or_else(|_| "unknown".to_string())
    } else {
        "not running".to_string()
    };
    Ok(SingboxStatus { running, version })
}
```

- [ ] **Step 3: Update lib.rs startup to use settings**

In `src-tauri/src/lib.rs`, change the startup block from:

```rust
if let Err(e) = process.start("info", 7893).await {
```

to:

```rust
let settings = crate::singbox::storage::load_settings();
if let Err(e) = process.start(&settings).await {
```

- [ ] **Step 4: Verify it compiles**

Run: `cd src-tauri && cargo check`
Expected: compiles with no errors

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/singbox/config.rs src-tauri/src/singbox/process.rs src-tauri/src/commands/connection.rs src-tauri/src/lib.rs
git commit -m "refactor: config and process use AppSettings"
```

---

## Task 4: Settings Tauri Commands

**Files:**
- Create: `src-tauri/src/commands/settings.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Implement settings commands**

Create `src-tauri/src/commands/settings.rs`:

```rust
use std::sync::Arc;
use tauri::{AppHandle, Manager};

use crate::singbox::process::SingboxProcess;
use crate::singbox::storage::{self, AppSettings};

#[tauri::command]
pub async fn get_settings() -> Result<AppSettings, String> {
    Ok(storage::load_settings())
}

#[tauri::command]
pub async fn update_settings(app: AppHandle, updates: serde_json::Value) -> Result<AppSettings, String> {
    let mut settings = storage::load_settings();
    let old_needs_restart = restart_key(&settings);

    // Merge updates into settings
    let mut json = serde_json::to_value(&settings).map_err(|e| e.to_string())?;
    if let (Some(base), Some(patch)) = (json.as_object_mut(), updates.as_object()) {
        for (k, v) in patch {
            base.insert(k.clone(), v.clone());
        }
    }
    settings = serde_json::from_value(json).map_err(|e| e.to_string())?;

    storage::save_settings(&settings)?;

    // Restart sing-box if port/logLevel/allowLan changed
    let new_needs_restart = restart_key(&settings);
    if old_needs_restart != new_needs_restart {
        let process = app.state::<Arc<SingboxProcess>>().inner().clone();
        if process.is_running().await {
            let _ = process.restart(&settings).await;
        }
    }

    Ok(settings)
}

fn restart_key(s: &AppSettings) -> String {
    format!(
        "{}:{}:{}:{}:{}",
        s.mixed_port, s.http_port, s.socks_port, s.log_level, s.allow_lan
    )
}
```

- [ ] **Step 2: Register module and commands**

Add to `src-tauri/src/commands/mod.rs`:

```rust
pub mod logs;
pub mod connection;
pub mod settings;
```

Add to the `invoke_handler` in `src-tauri/src/lib.rs`:

```rust
        .invoke_handler(tauri::generate_handler![
            commands::logs::start_log_stream,
            commands::connection::singbox_start,
            commands::connection::singbox_stop,
            commands::connection::singbox_restart,
            commands::connection::singbox_status,
            commands::settings::get_settings,
            commands::settings::update_settings,
        ])
```

- [ ] **Step 3: Verify it compiles**

Run: `cd src-tauri && cargo check`
Expected: compiles

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands/settings.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs
git commit -m "feat: get_settings / update_settings Tauri commands"
```

---

## Task 5: Frontend Settings Service — Tauri Implementation

**Files:**
- Modify: `src/services/settings.ts`

- [ ] **Step 1: Add Tauri implementation with isTauri switch**

Replace `src/services/settings.ts` with:

```typescript
import type { AppSettings, Theme } from "./types";

export interface SettingsService {
  getSettings(): Promise<AppSettings>;
  updateSettings(settings: Partial<AppSettings>): Promise<void>;
  setTheme(theme: Theme): Promise<void>;
}

// ---- Mock Implementation ----

let mockSettings: AppSettings = {
  theme: "dark",
  singboxPath: "/usr/local/bin/sing-box",
  autoStart: false,
  systemProxy: true,
  enhancedMode: false,
  tunConfig: {
    stack: "system",
    mtu: 9000,
    autoRoute: true,
    strictRoute: false,
    dnsHijack: ["198.18.0.2:53"],
  },
  allowLan: false,
  httpPort: 7890,
  socksPort: 7891,
  mixedPort: 7893,
  logLevel: "info",
};

const mockSettingsService: SettingsService = {
  async getSettings() {
    return { ...mockSettings, tunConfig: { ...mockSettings.tunConfig, dnsHijack: [...mockSettings.tunConfig.dnsHijack] } };
  },
  async updateSettings(settings) {
    mockSettings = { ...mockSettings, ...settings };
  },
  async setTheme(theme) {
    mockSettings.theme = theme;
  },
};

// ---- Tauri Implementation ----

function createTauriSettingsService(): SettingsService {
  return {
    async getSettings() {
      const { invoke } = await import("@tauri-apps/api/core");
      return invoke<AppSettings>("get_settings");
    },
    async updateSettings(settings) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("update_settings", { updates: settings });
    },
    async setTheme(theme) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("update_settings", { updates: { theme } });
    },
  };
}

// ---- Export ----

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
export const settingsService: SettingsService = isTauri ? createTauriSettingsService() : mockSettingsService;
```

- [ ] **Step 2: Run all tests**

Run: `npm test`
Expected: all tests pass (mock is used in vitest)

- [ ] **Step 3: Commit**

```bash
git add src/services/settings.ts
git commit -m "feat: Tauri settings service with persistence"
```

---

## Task 6: Integration Test

- [ ] **Step 1: Restart the app**

```bash
pkill -f sing-box; pkill -f calamity
lsof -ti:1420 | xargs kill -9 2>/dev/null
npm run tauri dev
```

- [ ] **Step 2: Verify settings load**

Open Settings page. Values should match defaults (mixedPort=7893, logLevel=info, etc).

- [ ] **Step 3: Change mixed port and verify restart**

Change Mixed Port to 7894. Check terminal for `[singbox] spawning:` with new config. Verify:

```bash
curl -s http://127.0.0.1:9091/version  # Clash API still up after restart
```

- [ ] **Step 4: Verify persistence**

Quit and relaunch the app. Settings page should show port 7894 (persisted).

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: settings integration fixes"
```
