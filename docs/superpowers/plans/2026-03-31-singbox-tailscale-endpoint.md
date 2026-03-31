# sing-box Native Tailscale Endpoint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace CLI-based Tailscale integration with sing-box's built-in Tailscale endpoint, removing the dependency on Tailscale.app.

**Architecture:** Tailscale runs as a sing-box endpoint configured via `06-tailscale.json` in the split config directory. Authentication uses OAuth (primary) or auth key (fallback), with interactive login URL detection as last resort. Device discovery uses the Tailscale API v2 with OAuth tokens. Exit node switching rewrites config and reloads sing-box.

**Tech Stack:** Rust (Tauri backend), TypeScript/React (frontend), sing-box Tailscale endpoint, Tailscale API v2 OAuth

---

## File Structure

### Files to Create
- `src-tauri/src/singbox/tailscale_storage.rs` — Tailscale settings persistence (enabled, auth_key, oauth credentials, exit_node, etc.)
- `src-tauri/src/singbox/tailscale_api.rs` — OAuth token management + Tailscale API v2 device list
- `src-tauri/src/singbox/tailscale_config.rs` — Generates `06-tailscale.json` for sing-box config directory

### Files to Modify
- `src-tauri/src/singbox/mod.rs` — Replace `tailscale_cli` module with new modules
- `src-tauri/src/commands/tailscale.rs` — Rewrite with new commands
- `src-tauri/src/commands/mod.rs` — No change needed (module name stays `tailscale`)
- `src-tauri/src/lib.rs` — Replace 7 old command registrations with new ones
- `src-tauri/src/singbox/config.rs:483-521` — Skip cleaning `06-tailscale.json` in `write_config`
- `src-tauri/Cargo.toml` — No new deps needed (already has reqwest, serde_json, tokio, chrono)
- `src/services/tailnet.ts` — Rewrite: remove mock/funnel, new Tauri commands
- `src/services/types.ts` — Remove `FunnelEntry`-related types, add `TailscaleSettings`
- `src/stores/tailnet.ts` — Simplify: no funnel state, add settings/save
- `src/pages/TailnetPage.tsx` — Rewrite: OAuth setup, device list, exit node, no funnel
- `src/i18n/resources.ts` — Update tailnet translations

### Files to Delete
- `src-tauri/src/singbox/tailscale_cli.rs` — Replaced entirely
- `src/services/__tests__/tailnet.test.ts` — Tests for old mock service
- `src/services/__tests__/tailnet-funnel.test.ts` — Funnel tests
- `src/stores/__tests__/tailnet.test.ts` — Store tests for old interface

---

## Task 1: Tailscale Settings Storage

**Files:**
- Create: `src-tauri/src/singbox/tailscale_storage.rs`
- Modify: `src-tauri/src/singbox/mod.rs`

- [ ] **Step 1: Create tailscale_storage.rs with data types and load/save**

```rust
// src-tauri/src/singbox/tailscale_storage.rs
use serde::{Deserialize, Serialize};

use super::storage::{read_json, write_json};

const TAILSCALE_FILE: &str = "tailscale.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TailscaleSettings {
    #[serde(default)]
    pub enabled: bool,
    /// Pre-auth key (optional, for headless login)
    #[serde(default)]
    pub auth_key: String,
    /// OAuth client ID from Tailscale admin console
    #[serde(default)]
    pub oauth_client_id: String,
    /// OAuth client secret
    #[serde(default)]
    pub oauth_client_secret: String,
    /// Cached OAuth access token
    #[serde(default)]
    pub oauth_access_token: String,
    /// Token expiry (RFC3339)
    #[serde(default)]
    pub oauth_token_expires: String,
    /// Tailnet name (discovered from OAuth or set manually)
    #[serde(default)]
    pub tailnet: String,
    /// Hostname for this sing-box node on the tailnet
    #[serde(default = "default_hostname")]
    pub hostname: String,
    /// Exit node name or IP (empty = no exit node)
    #[serde(default)]
    pub exit_node: String,
    /// Accept routes advertised by other nodes
    #[serde(default)]
    pub accept_routes: bool,
    /// Routes to advertise (CIDR prefixes)
    #[serde(default)]
    pub advertise_routes: Vec<String>,
}

fn default_hostname() -> String {
    "calamity".to_string()
}

impl Default for TailscaleSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            auth_key: String::new(),
            oauth_client_id: String::new(),
            oauth_client_secret: String::new(),
            oauth_access_token: String::new(),
            oauth_token_expires: String::new(),
            tailnet: String::new(),
            hostname: default_hostname(),
            exit_node: String::new(),
            accept_routes: false,
            advertise_routes: Vec::new(),
        }
    }
}

pub fn load_tailscale_settings() -> TailscaleSettings {
    read_json(TAILSCALE_FILE)
}

pub fn save_tailscale_settings(settings: &TailscaleSettings) -> Result<(), String> {
    write_json(TAILSCALE_FILE, settings)
}
```

- [ ] **Step 2: Register module in mod.rs**

Replace `pub mod tailscale_cli;` with the three new modules in `src-tauri/src/singbox/mod.rs`:

```rust
pub mod tailscale_api;
pub mod tailscale_config;
pub mod tailscale_storage;
```

(This will cause compile errors until we create the other two files — that's fine, we'll create stubs next.)

- [ ] **Step 3: Create stub files for tailscale_api.rs and tailscale_config.rs**

`src-tauri/src/singbox/tailscale_api.rs`:
```rust
// Placeholder — implemented in Task 2
```

`src-tauri/src/singbox/tailscale_config.rs`:
```rust
// Placeholder — implemented in Task 3
```

- [ ] **Step 4: Verify it compiles**

Run: `cd src-tauri && cargo check 2>&1 | head -20`
Expected: Errors only from `commands/tailscale.rs` referencing old `tailscale_cli` module (we'll fix that in Task 5).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/singbox/tailscale_storage.rs src-tauri/src/singbox/tailscale_api.rs src-tauri/src/singbox/tailscale_config.rs src-tauri/src/singbox/mod.rs
git commit -m "feat(tailscale): add settings storage for sing-box native endpoint"
```

---

## Task 2: Tailscale OAuth API Client

**Files:**
- Create: `src-tauri/src/singbox/tailscale_api.rs`

- [ ] **Step 1: Implement OAuth token fetch and device list API**

```rust
// src-tauri/src/singbox/tailscale_api.rs
use serde::{Deserialize, Serialize};

use super::tailscale_storage::{self, TailscaleSettings};

const TOKEN_URL: &str = "https://api.tailscale.com/api/v2/oauth/token";

#[derive(Debug, Deserialize)]
struct OAuthTokenResponse {
    access_token: String,
    expires_in: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TailscaleDevice {
    pub id: String,
    pub name: String,
    pub hostname: String,
    pub ip: String,
    pub os: String,
    pub status: String,
    pub last_seen: String,
    pub is_exit_node: bool,
    pub is_self: bool,
}

#[derive(Debug, Deserialize)]
struct ApiDevicesResponse {
    devices: Vec<ApiDevice>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ApiDevice {
    #[serde(rename = "nodeId")]
    node_id: String,
    #[serde(default)]
    name: String,
    hostname: String,
    addresses: Vec<String>,
    os: String,
    #[serde(default)]
    last_seen: String,
    #[serde(default)]
    online: bool,
    #[serde(rename = "keyExpiryDisabled", default)]
    key_expiry_disabled: bool,
    #[serde(rename = "allowedIPs", default)]
    allowed_ips: Vec<String>,
}

/// Fetch a fresh OAuth access token using client credentials.
async fn fetch_oauth_token(client_id: &str, client_secret: &str) -> Result<(String, String), String> {
    let client = reqwest::Client::new();
    let resp = client
        .post(TOKEN_URL)
        .basic_auth(client_id, Some(client_secret))
        .form(&[("grant_type", "client_credentials")])
        .send()
        .await
        .map_err(|e| format!("OAuth token request failed: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("OAuth token error {}: {}", status, body));
    }

    let token_resp: OAuthTokenResponse = resp
        .json()
        .await
        .map_err(|e| format!("OAuth token parse error: {}", e))?;

    let expires_at = chrono::Utc::now()
        + chrono::Duration::seconds(token_resp.expires_in as i64 - 60); // 60s buffer
    Ok((token_resp.access_token, expires_at.to_rfc3339()))
}

/// Get a valid OAuth access token, refreshing if expired.
pub async fn get_oauth_token(settings: &mut TailscaleSettings) -> Result<String, String> {
    if settings.oauth_client_id.is_empty() || settings.oauth_client_secret.is_empty() {
        return Err("OAuth client credentials not configured".to_string());
    }

    // Check if cached token is still valid
    if !settings.oauth_access_token.is_empty() && !settings.oauth_token_expires.is_empty() {
        if let Ok(expires) = chrono::DateTime::parse_from_rfc3339(&settings.oauth_token_expires) {
            if expires > chrono::Utc::now() {
                return Ok(settings.oauth_access_token.clone());
            }
        }
    }

    // Refresh
    let (token, expires) =
        fetch_oauth_token(&settings.oauth_client_id, &settings.oauth_client_secret).await?;
    settings.oauth_access_token = token.clone();
    settings.oauth_token_expires = expires;
    tailscale_storage::save_tailscale_settings(settings)?;

    Ok(token)
}

/// Fetch devices from Tailscale API v2.
pub async fn fetch_devices(settings: &mut TailscaleSettings) -> Result<Vec<TailscaleDevice>, String> {
    let token = get_oauth_token(settings).await?;
    let tailnet = if settings.tailnet.is_empty() {
        "-" // "-" means "the tailnet of the authenticated user"
    } else {
        &settings.tailnet
    };

    let url = format!("https://api.tailscale.com/api/v2/tailnet/{}/devices", tailnet);
    let client = reqwest::Client::new();
    let resp = client
        .get(&url)
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Tailscale API request failed: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Tailscale API error {}: {}", status, body));
    }

    let api_resp: ApiDevicesResponse = resp
        .json()
        .await
        .map_err(|e| format!("Tailscale API parse error: {}", e))?;

    let our_hostname = &settings.hostname;
    let devices = api_resp
        .devices
        .into_iter()
        .map(|d| {
            let ip = d.addresses.first().cloned().unwrap_or_default();
            // Exit node capability: has 0.0.0.0/0 in allowedIPs
            let is_exit = d.allowed_ips.iter().any(|ip| ip == "0.0.0.0/0" || ip == "::/0");
            let display_name = d.name.split('.').next().unwrap_or(&d.name).to_string();
            let is_self = d.hostname.eq_ignore_ascii_case(our_hostname);
            TailscaleDevice {
                id: d.node_id,
                name: display_name,
                hostname: d.hostname,
                ip,
                os: d.os,
                status: if d.online { "online" } else { "offline" }.to_string(),
                last_seen: d.last_seen,
                is_exit_node: is_exit,
                is_self,
            }
        })
        .collect();

    Ok(devices)
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd src-tauri && cargo check 2>&1 | head -20`
Expected: Errors only from `commands/tailscale.rs` (old module references).

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/singbox/tailscale_api.rs
git commit -m "feat(tailscale): add OAuth token management and device list API"
```

---

## Task 3: Tailscale Config Generator

**Files:**
- Create: `src-tauri/src/singbox/tailscale_config.rs`
- Modify: `src-tauri/src/singbox/config.rs` (minor: preserve 06-tailscale.json during clean)

- [ ] **Step 1: Implement config file generation**

```rust
// src-tauri/src/singbox/tailscale_config.rs
use serde_json::json;

use super::storage;
use super::tailscale_storage::{self, TailscaleSettings};

const TAILSCALE_CONFIG_FILE: &str = "06-tailscale.json";

/// Generate and write 06-tailscale.json to the config directory.
/// If Tailscale is disabled, removes the file.
pub fn write_tailscale_config() -> Result<(), String> {
    let settings = tailscale_storage::load_tailscale_settings();
    let config_dir = storage::singbox_config_dir();
    let config_path = config_dir.join(TAILSCALE_CONFIG_FILE);

    if !settings.enabled {
        // Remove the config file if it exists
        let _ = std::fs::remove_file(&config_path);
        return Ok(());
    }

    std::fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;

    let mut endpoint = json!({
        "type": "tailscale",
        "tag": "tailscale-ep",
        "state_directory": "tailscale",
        "hostname": settings.hostname,
        "accept_routes": settings.accept_routes,
    });

    if !settings.auth_key.is_empty() {
        endpoint["auth_key"] = json!(settings.auth_key);
    }

    if !settings.exit_node.is_empty() {
        endpoint["exit_node"] = json!(settings.exit_node);
    }

    if !settings.advertise_routes.is_empty() {
        endpoint["advertise_routes"] = json!(settings.advertise_routes);
    }

    let config = json!({
        "endpoints": [endpoint]
    });

    let content = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    std::fs::write(&config_path, content).map_err(|e| e.to_string())
}

/// Remove the Tailscale config file.
pub fn remove_tailscale_config() {
    let config_dir = storage::singbox_config_dir();
    let config_path = config_dir.join(TAILSCALE_CONFIG_FILE);
    let _ = std::fs::remove_file(&config_path);
}
```

- [ ] **Step 2: Update config.rs to preserve 06-tailscale.json during clean**

In `src-tauri/src/singbox/config.rs`, in the `write_config` function, change the clean loop to skip `06-tailscale.json`:

Find this code in `write_config`:
```rust
    // Clean old files
    if let Ok(entries) = std::fs::read_dir(&config_dir) {
        for entry in entries.flatten() {
            if entry.path().extension().is_some_and(|e| e == "json") {
                let _ = std::fs::remove_file(entry.path());
            }
        }
    }
```

Replace with:
```rust
    // Clean old files (preserve 06-tailscale.json — managed by tailscale_config)
    if let Ok(entries) = std::fs::read_dir(&config_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().is_some_and(|e| e == "json")
                && path.file_name().is_some_and(|n| n != "06-tailscale.json")
            {
                let _ = std::fs::remove_file(path);
            }
        }
    }
```

- [ ] **Step 3: Verify it compiles**

Run: `cd src-tauri && cargo check 2>&1 | head -20`

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/singbox/tailscale_config.rs src-tauri/src/singbox/config.rs
git commit -m "feat(tailscale): add sing-box config generator for Tailscale endpoint"
```

---

## Task 4: Delete Old CLI Code

**Files:**
- Delete: `src-tauri/src/singbox/tailscale_cli.rs`

- [ ] **Step 1: Delete the old CLI module**

```bash
rm src-tauri/src/singbox/tailscale_cli.rs
```

- [ ] **Step 2: Verify mod.rs no longer references it**

`src-tauri/src/singbox/mod.rs` should already have the new modules from Task 1, Step 2. Confirm `tailscale_cli` is not listed.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/singbox/tailscale_cli.rs
git commit -m "refactor(tailscale): remove CLI-based tailscale_cli module"
```

---

## Task 5: Rewrite Tauri Commands

**Files:**
- Modify: `src-tauri/src/commands/tailscale.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Rewrite commands/tailscale.rs**

```rust
// src-tauri/src/commands/tailscale.rs
use std::sync::Arc;
use tauri::{AppHandle, Manager};

use crate::singbox::process::SingboxProcess;
use crate::singbox::storage;
use crate::singbox::tailscale_api;
use crate::singbox::tailscale_config;
use crate::singbox::tailscale_storage::{self, TailscaleSettings};

#[tauri::command]
pub async fn tailscale_get_settings() -> Result<TailscaleSettings, String> {
    Ok(tailscale_storage::load_tailscale_settings())
}

#[tauri::command]
pub async fn tailscale_save_settings(
    app: AppHandle,
    settings: TailscaleSettings,
) -> Result<(), String> {
    tailscale_storage::save_tailscale_settings(&settings)?;
    tailscale_config::write_tailscale_config()?;
    // Reload sing-box if running
    reload_singbox(&app).await;
    Ok(())
}

#[tauri::command]
pub async fn tailscale_get_devices() -> Result<Vec<tailscale_api::TailscaleDevice>, String> {
    let mut settings = tailscale_storage::load_tailscale_settings();
    tailscale_api::fetch_devices(&mut settings).await
}

#[tauri::command]
pub async fn tailscale_set_exit_node(
    app: AppHandle,
    exit_node: String,
) -> Result<(), String> {
    let mut settings = tailscale_storage::load_tailscale_settings();
    settings.exit_node = exit_node;
    tailscale_storage::save_tailscale_settings(&settings)?;
    tailscale_config::write_tailscale_config()?;
    reload_singbox(&app).await;
    Ok(())
}

#[tauri::command]
pub async fn tailscale_test_oauth(
    client_id: String,
    client_secret: String,
) -> Result<String, String> {
    let mut settings = TailscaleSettings {
        oauth_client_id: client_id,
        oauth_client_secret: client_secret,
        ..Default::default()
    };
    let token = tailscale_api::get_oauth_token(&mut settings).await?;
    Ok(format!("OAuth token obtained, expires: {}", settings.oauth_token_expires))
}

async fn reload_singbox(app: &AppHandle) {
    let process = app.state::<Arc<SingboxProcess>>().inner().clone();
    if process.is_running().await {
        let settings = storage::load_settings();
        let _ = process.reload(&settings).await;
    }
}
```

- [ ] **Step 2: Update lib.rs invoke_handler**

In `src-tauri/src/lib.rs`, replace the 7 old tailscale commands:

```rust
            commands::tailscale::tailscale_status,
            commands::tailscale::tailscale_login,
            commands::tailscale::tailscale_logout,
            commands::tailscale::tailscale_set_exit_node,
            commands::tailscale::tailscale_get_serve_status,
            commands::tailscale::tailscale_add_funnel,
            commands::tailscale::tailscale_remove_funnel,
```

With:

```rust
            commands::tailscale::tailscale_get_settings,
            commands::tailscale::tailscale_save_settings,
            commands::tailscale::tailscale_get_devices,
            commands::tailscale::tailscale_set_exit_node,
            commands::tailscale::tailscale_test_oauth,
```

- [ ] **Step 3: Verify it compiles**

Run: `cd src-tauri && cargo check 2>&1 | head -20`
Expected: PASS (no errors)

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands/tailscale.rs src-tauri/src/lib.rs
git commit -m "feat(tailscale): rewrite Tauri commands for sing-box native endpoint"
```

---

## Task 6: Rewrite Frontend Service and Store

**Files:**
- Modify: `src/services/tailnet.ts`
- Modify: `src/services/types.ts`
- Modify: `src/stores/tailnet.ts`
- Delete: `src/services/__tests__/tailnet.test.ts`
- Delete: `src/services/__tests__/tailnet-funnel.test.ts`
- Delete: `src/stores/__tests__/tailnet.test.ts`

- [ ] **Step 1: Update types.ts — remove FunnelEntry-related, add TailscaleSettings**

In `src/services/types.ts`, the `TailnetDevice` interface stays as-is but we remove `isCurrentExitNode` (exit node is now in settings, not device state). Actually, we can keep the type for display purposes — we'll mark it client-side.

Add after the `TailnetDevice` interface:

```typescript
export interface TailscaleSettings {
  enabled: boolean;
  authKey: string;
  oauthClientId: string;
  oauthClientSecret: string;
  oauthAccessToken: string;
  oauthTokenExpires: string;
  tailnet: string;
  hostname: string;
  exitNode: string;
  acceptRoutes: boolean;
  advertiseRoutes: string[];
}
```

- [ ] **Step 2: Rewrite services/tailnet.ts**

```typescript
// src/services/tailnet.ts
import type { TailnetDevice, TailscaleSettings } from "./types";

export interface TailnetService {
  getSettings(): Promise<TailscaleSettings>;
  saveSettings(settings: TailscaleSettings): Promise<void>;
  getDevices(): Promise<TailnetDevice[]>;
  setExitNode(exitNode: string): Promise<void>;
  testOAuth(clientId: string, clientSecret: string): Promise<string>;
}

function createTauriTailnetService(): TailnetService {
  return {
    async getSettings() {
      const { invoke } = await import("@tauri-apps/api/core");
      return invoke<TailscaleSettings>("tailscale_get_settings");
    },
    async saveSettings(settings) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("tailscale_save_settings", { settings });
    },
    async getDevices() {
      const { invoke } = await import("@tauri-apps/api/core");
      return invoke<TailnetDevice[]>("tailscale_get_devices");
    },
    async setExitNode(exitNode) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("tailscale_set_exit_node", { exitNode });
    },
    async testOAuth(clientId, clientSecret) {
      const { invoke } = await import("@tauri-apps/api/core");
      return invoke<string>("tailscale_test_oauth", { clientId, clientSecret });
    },
  };
}

// Mock for dev/test
function createMockTailnetService(): TailnetService {
  let mockSettings: TailscaleSettings = {
    enabled: false,
    authKey: "",
    oauthClientId: "",
    oauthClientSecret: "",
    oauthAccessToken: "",
    oauthTokenExpires: "",
    tailnet: "",
    hostname: "calamity",
    exitNode: "",
    acceptRoutes: false,
    advertiseRoutes: [],
  };

  const mockDevices: TailnetDevice[] = [
    { id: "d1", name: "MacBook Pro", hostname: "macbook-pro", ip: "100.64.0.1", os: "macOS", status: "online", lastSeen: new Date().toISOString(), isExitNode: false, isCurrentExitNode: false, isSelf: true },
    { id: "d2", name: "Home Server", hostname: "homelab-nas", ip: "100.64.0.2", os: "Linux", status: "online", lastSeen: new Date().toISOString(), isExitNode: true, isCurrentExitNode: false, isSelf: false },
    { id: "d3", name: "Office Desktop", hostname: "office-pc", ip: "100.64.0.3", os: "Windows", status: "online", lastSeen: new Date().toISOString(), isExitNode: true, isCurrentExitNode: false, isSelf: false },
  ];

  return {
    async getSettings() { return { ...mockSettings }; },
    async saveSettings(s) { mockSettings = { ...s }; },
    async getDevices() { return mockDevices.map(d => ({ ...d })); },
    async setExitNode(exitNode) { mockSettings.exitNode = exitNode; },
    async testOAuth() { return "Mock OAuth success"; },
  };
}

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
export const tailnetService: TailnetService = isTauri
  ? createTauriTailnetService()
  : createMockTailnetService();
```

- [ ] **Step 3: Rewrite stores/tailnet.ts**

```typescript
// src/stores/tailnet.ts
import { create } from "zustand";
import { tailnetService } from "../services/tailnet";
import type { TailnetDevice, TailscaleSettings } from "../services/types";

interface TailnetStore {
  settings: TailscaleSettings | null;
  devices: TailnetDevice[];
  loading: boolean;
  fetchSettings: () => Promise<void>;
  saveSettings: (settings: TailscaleSettings) => Promise<void>;
  fetchDevices: () => Promise<void>;
  setExitNode: (exitNode: string) => Promise<void>;
}

export const useTailnetStore = create<TailnetStore>((set, get) => ({
  settings: null,
  devices: [],
  loading: false,

  async fetchSettings() {
    const settings = await tailnetService.getSettings();
    set({ settings });
  },
  async saveSettings(settings) {
    await tailnetService.saveSettings(settings);
    set({ settings });
  },
  async fetchDevices() {
    set({ loading: true });
    try {
      const devices = await tailnetService.getDevices();
      set({ devices });
    } catch (e) {
      console.error("Failed to fetch devices:", e);
    } finally {
      set({ loading: false });
    }
  },
  async setExitNode(exitNode) {
    await tailnetService.setExitNode(exitNode);
    // Update local settings
    const settings = get().settings;
    if (settings) {
      set({ settings: { ...settings, exitNode } });
    }
  },
}));
```

- [ ] **Step 4: Delete old test files**

```bash
rm src/services/__tests__/tailnet.test.ts
rm src/services/__tests__/tailnet-funnel.test.ts
rm src/stores/__tests__/tailnet.test.ts
```

- [ ] **Step 5: Verify frontend compiles**

Run: `cd /Users/linqiankai/calamity && npx tsc --noEmit 2>&1 | head -30`
Expected: Errors only from `TailnetPage.tsx` (which still uses old interfaces — fixed in Task 7).

- [ ] **Step 6: Commit**

```bash
git add src/services/tailnet.ts src/services/types.ts src/stores/tailnet.ts
git add src/services/__tests__/tailnet.test.ts src/services/__tests__/tailnet-funnel.test.ts src/stores/__tests__/tailnet.test.ts
git commit -m "feat(tailscale): rewrite frontend service and store for native endpoint"
```

---

## Task 7: Rewrite TailnetPage UI

**Files:**
- Modify: `src/pages/TailnetPage.tsx`
- Modify: `src/i18n/resources.ts`

- [ ] **Step 1: Update i18n translations**

Replace the `tailnet` section in both `en` and `zh-CN` translations in `src/i18n/resources.ts`.

English:
```typescript
      tailnet: {
        title: "Tailnet",
        subtitle: "Mesh VPN via sing-box Tailscale endpoint",
        setup: "Setup",
        setupDescription: "Configure OAuth credentials from your Tailscale admin console to enable device discovery.",
        oauthClientId: "OAuth Client ID",
        oauthClientSecret: "OAuth Client Secret",
        authKey: "Auth Key (optional)",
        authKeyHint: "Pre-auth key for headless login. Leave empty for interactive login via URL.",
        hostname: "Hostname",
        testOAuth: "Test Connection",
        testing: "Testing...",
        testSuccess: "Connection successful",
        enabled: "Enabled",
        disabled: "Disabled",
        devicesOnline: "{{online}}/{{total}} devices online",
        exitNodeSummary: "Exit node: {{name}}",
        thisDevice: "This device",
        active: "Active",
        exitNode: "Exit Node",
        noExitNode: "No exit node selected",
        disconnect: "Disconnect",
        noOAuth: "Configure OAuth to see devices",
        manualExitNode: "Exit Node (name or IP)",
        save: "Save",
        acceptRoutes: "Accept Routes",
        refreshDevices: "Refresh",
      },
```

Chinese:
```typescript
      tailnet: {
        title: "Tailnet",
        subtitle: "通过 sing-box Tailscale 端点实现组网",
        setup: "设置",
        setupDescription: "从 Tailscale 管理控制台配置 OAuth 凭据以启用设备发现。",
        oauthClientId: "OAuth 客户端 ID",
        oauthClientSecret: "OAuth 客户端密钥",
        authKey: "认证密钥（可选）",
        authKeyHint: "用于无头登录的预认证密钥。留空则通过 URL 交互式登录。",
        hostname: "主机名",
        testOAuth: "测试连接",
        testing: "测试中...",
        testSuccess: "连接成功",
        enabled: "已启用",
        disabled: "已禁用",
        devicesOnline: "{{online}}/{{total}} 设备在线",
        exitNodeSummary: "出口节点：{{name}}",
        thisDevice: "本设备",
        active: "活跃",
        exitNode: "出口节点",
        noExitNode: "未选择出口节点",
        disconnect: "断开",
        noOAuth: "配置 OAuth 以查看设备",
        manualExitNode: "出口节点（名称或 IP）",
        save: "保存",
        acceptRoutes: "接受路由",
        refreshDevices: "刷新",
      },
```

- [ ] **Step 2: Rewrite TailnetPage.tsx**

```tsx
// src/pages/TailnetPage.tsx
import { useEffect, useState } from "react";
import {
  Monitor, Smartphone, Server, LogOut, Network, Settings2, Loader2,
  RefreshCw, Check, Power,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useTailnetStore } from "@/stores/tailnet";
import { cn } from "@/lib/utils";
import { tailnetService } from "@/services/tailnet";
import type { TailnetDevice } from "@/services/types";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

function deviceIcon(os: string) {
  switch (os.toLowerCase()) {
    case "macos": case "windows": case "linux": return Monitor;
    case "ios": case "android": return Smartphone;
    default: return Server;
  }
}

function DeviceCard({
  device, index, isCurrentExit, onSetExitNode,
}: {
  device: TailnetDevice; index: number; isCurrentExit: boolean;
  onSetExitNode: (name: string) => void;
}) {
  const { t } = useTranslation();
  const Icon = deviceIcon(device.os);
  const isOnline = device.status === "online";

  return (
    <div
      className={cn(
        "animate-slide-up rounded-xl border border-white/[0.06] bg-card/40 backdrop-blur-xl p-4 transition-all duration-200 hover:border-white/10 hover:bg-card/80",
        !isOnline && "opacity-50"
      )}
      style={{ animationDelay: `${(index + 3) * 80}ms` }}
    >
      <div className="flex items-center gap-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.06] bg-muted/30">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium truncate text-sm">{device.name}</span>
            {device.isSelf && (
              <Badge variant="outline" className="text-[10px] border-primary/30 bg-primary/15 text-primary">
                {t("tailnet.thisDevice")}
              </Badge>
            )}
            <span className="relative">
              <span className={cn("block h-2 w-2 rounded-full", isOnline ? "bg-green-500" : "bg-muted-foreground/40")} />
              {isOnline && <span className="absolute inset-0 h-2 w-2 rounded-full bg-green-500 animate-ping opacity-75" />}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">{device.ip} • {device.os} • {device.hostname}</p>
        </div>
        {device.isExitNode && !device.isSelf && (
          <Button
            variant={isCurrentExit ? "default" : "outline"}
            size="sm"
            className={cn(
              "transition-all duration-200",
              isCurrentExit ? "shadow-[0_0_15px_rgba(254,151,185,0.15)]" : "border-white/[0.06]"
            )}
            onClick={() => onSetExitNode(isCurrentExit ? "" : device.name)}
            disabled={!isOnline}
          >
            <LogOut className="mr-2 h-3.5 w-3.5" />
            {isCurrentExit ? t("tailnet.active") : t("tailnet.exitNode")}
          </Button>
        )}
      </div>
    </div>
  );
}

export function TailnetPage() {
  const { t } = useTranslation();
  const { settings, devices, loading, fetchSettings, saveSettings, fetchDevices, setExitNode } = useTailnetStore();

  const [oauthId, setOauthId] = useState("");
  const [oauthSecret, setOauthSecret] = useState("");
  const [authKey, setAuthKey] = useState("");
  const [hostname, setHostname] = useState("calamity");
  const [testing, setTesting] = useState(false);
  const [manualExitNode, setManualExitNode] = useState("");

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  useEffect(() => {
    if (settings) {
      setOauthId(settings.oauthClientId);
      setOauthSecret(settings.oauthClientSecret);
      setAuthKey(settings.authKey);
      setHostname(settings.hostname);
      setManualExitNode(settings.exitNode);
    }
  }, [settings]);

  useEffect(() => {
    if (settings?.enabled && settings.oauthClientId) {
      fetchDevices();
    }
  }, [settings?.enabled, settings?.oauthClientId, fetchDevices]);

  const hasOAuth = settings?.oauthClientId && settings?.oauthClientSecret;
  const onlineCount = devices.filter(d => d.status === "online").length;
  const currentExitName = settings?.exitNode || "";
  const currentExitDevice = devices.find(d => d.name === currentExitName || d.ip === currentExitName);

  async function handleTestOAuth() {
    setTesting(true);
    try {
      await tailnetService.testOAuth(oauthId, oauthSecret);
      toast.success(t("tailnet.testSuccess"));
    } catch (e: any) {
      toast.error(e?.message || String(e));
    } finally {
      setTesting(false);
    }
  }

  async function handleSave() {
    if (!settings) return;
    await saveSettings({
      ...settings,
      oauthClientId: oauthId,
      oauthClientSecret: oauthSecret,
      authKey,
      hostname,
    });
    toast.success(t("tailnet.save"));
  }

  async function handleToggle(enabled: boolean) {
    if (!settings) return;
    await saveSettings({ ...settings, enabled });
  }

  async function handleSetExitNode(name: string) {
    await setExitNode(name);
    setManualExitNode(name);
  }

  if (!settings) return null;

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between animate-slide-up">
        <div>
          <h1 className="text-xl font-semibold">{t("tailnet.title")}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{t("tailnet.subtitle")}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {settings.enabled ? t("tailnet.enabled") : t("tailnet.disabled")}
          </span>
          <Switch checked={settings.enabled} onCheckedChange={handleToggle} />
        </div>
      </div>

      {/* Setup Section */}
      <div className="rounded-xl border border-white/[0.06] bg-card/40 backdrop-blur-xl p-5 animate-slide-up space-y-4" style={{ animationDelay: "80ms" }}>
        <div className="flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-medium">{t("tailnet.setup")}</h3>
        </div>
        <p className="text-xs text-muted-foreground">{t("tailnet.setupDescription")}</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{t("tailnet.oauthClientId")}</label>
            <Input className="bg-muted/30 border-white/[0.06] h-8 text-xs font-mono" value={oauthId} onChange={e => setOauthId(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{t("tailnet.oauthClientSecret")}</label>
            <Input className="bg-muted/30 border-white/[0.06] h-8 text-xs font-mono" type="password" value={oauthSecret} onChange={e => setOauthSecret(e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{t("tailnet.authKey")}</label>
            <Input className="bg-muted/30 border-white/[0.06] h-8 text-xs font-mono" type="password" value={authKey} onChange={e => setAuthKey(e.target.value)} placeholder={t("tailnet.authKeyHint")} />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{t("tailnet.hostname")}</label>
            <Input className="bg-muted/30 border-white/[0.06] h-8 text-xs" value={hostname} onChange={e => setHostname(e.target.value)} />
          </div>
        </div>

        <div className="flex items-center gap-2">
          {oauthId && oauthSecret && (
            <Button variant="outline" size="sm" className="border-white/[0.06] text-xs" onClick={handleTestOAuth} disabled={testing}>
              {testing ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : <Check className="mr-1.5 h-3 w-3" />}
              {testing ? t("tailnet.testing") : t("tailnet.testOAuth")}
            </Button>
          )}
          <Button size="sm" className="text-xs shadow-[0_0_15px_rgba(254,151,185,0.15)]" onClick={handleSave}>
            {t("tailnet.save")}
          </Button>
        </div>
      </div>

      {/* Exit Node */}
      {settings.enabled && (
        <div className="rounded-xl border border-primary/20 bg-primary/[0.04] backdrop-blur-xl p-4 animate-slide-up shadow-[0_0_25px_rgba(254,151,185,0.06)]" style={{ animationDelay: "160ms" }}>
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">{t("tailnet.exitNode")}</p>
          {currentExitName ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">{currentExitDevice?.name || currentExitName}</p>
                <p className="text-xs text-muted-foreground">{currentExitDevice?.ip || currentExitName}</p>
              </div>
              <Button variant="outline" size="sm" className="border-white/[0.06]" onClick={() => handleSetExitNode("")}>
                {t("tailnet.disconnect")}
              </Button>
            </div>
          ) : hasOAuth ? (
            <p className="text-sm text-muted-foreground">{t("tailnet.noExitNode")}</p>
          ) : (
            <div className="flex items-center gap-2">
              <Input
                className="bg-muted/30 border-white/[0.06] h-8 text-xs flex-1"
                value={manualExitNode}
                onChange={e => setManualExitNode(e.target.value)}
                placeholder={t("tailnet.manualExitNode")}
              />
              <Button size="sm" className="h-8 text-xs" onClick={() => handleSetExitNode(manualExitNode)}>
                <Power className="mr-1 h-3 w-3" /> Set
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Devices */}
      {settings.enabled && hasOAuth && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {t("tailnet.devicesOnline", { online: onlineCount, total: devices.length })}
            </p>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={fetchDevices} disabled={loading}>
              <RefreshCw className={cn("mr-1 h-3 w-3", loading && "animate-spin")} />
              {t("tailnet.refreshDevices")}
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[...devices]
              .sort((a, b) => {
                if (a.isSelf !== b.isSelf) return a.isSelf ? -1 : 1;
                if ((a.status === "online") !== (b.status === "online")) return a.status === "online" ? -1 : 1;
                return 0;
              })
              .map((device, i) => (
                <DeviceCard
                  key={device.id}
                  device={device}
                  index={i}
                  isCurrentExit={device.name === currentExitName || device.ip === currentExitName}
                  onSetExitNode={handleSetExitNode}
                />
              ))}
          </div>
        </>
      )}

      {settings.enabled && !hasOAuth && (
        <p className="text-xs text-muted-foreground text-center py-4">{t("tailnet.noOAuth")}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify frontend compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/pages/TailnetPage.tsx src/i18n/resources.ts
git commit -m "feat(tailscale): rewrite UI for sing-box native Tailscale endpoint"
```

---

## Task 8: Write Tailscale Config on sing-box Start

**Files:**
- Modify: `src-tauri/src/singbox/config.rs`

When `write_config` is called (before sing-box starts), also write the Tailscale config:

- [ ] **Step 1: Call tailscale_config::write_tailscale_config at end of write_config**

In `src-tauri/src/singbox/config.rs`, add at the top:

```rust
use super::tailscale_config;
```

At the end of `write_config`, before the `Ok(...)` return:

```rust
    // Write Tailscale endpoint config (06-tailscale.json) if enabled
    tailscale_config::write_tailscale_config()?;
```

- [ ] **Step 2: Verify it compiles**

Run: `cd src-tauri && cargo check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/singbox/config.rs
git commit -m "feat(tailscale): write Tailscale config on sing-box start"
```

---

## Task 9: Full Build Verification and Cleanup

**Files:**
- Verify all files compile and tests pass

- [ ] **Step 1: Run Rust tests**

Run: `cd src-tauri && cargo test 2>&1`
Expected: All tests pass

- [ ] **Step 2: Run frontend type check**

Run: `npx tsc --noEmit 2>&1`
Expected: No errors

- [ ] **Step 3: Run frontend tests**

Run: `npx vitest run 2>&1`
Expected: All tests pass (old tailnet tests are deleted)

- [ ] **Step 4: Full build**

Run: `cd src-tauri && cargo build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 5: Commit any remaining fixes**

```bash
git add -A
git commit -m "chore: cleanup and verify full build for Tailscale endpoint migration"
```
