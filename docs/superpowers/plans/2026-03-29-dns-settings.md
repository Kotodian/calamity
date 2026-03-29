# DNS Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up the existing DNS UI to real sing-box backend with independent `dns.json` persistence, preset DNS servers, match-type DNS rules, and dynamic config generation.

**Architecture:** New `dns_storage.rs` module handles DNS-specific types and `dns.json` persistence (parallel to existing `storage.rs` for `settings.json`). New `commands/dns.rs` exposes Tauri commands for DNS CRUD. `config.rs` reads from both AppSettings and DnsSettings to generate the full sing-box config. Frontend replaces mock DNS service with Tauri invoke calls, removes cache tab, adds match-type support to rules, and adds preset server selection.

**Tech Stack:** Rust (serde, serde_json), Tauri v2 commands, React + TypeScript, Zustand stores

---

## File Structure

### Backend (Rust)
| File | Action | Responsibility |
|------|--------|----------------|
| `src-tauri/src/singbox/dns_storage.rs` | Create | DNS types (`DnsSettings`, `DnsServerConfig`, `DnsRuleConfig`) + `dns.json` read/write |
| `src-tauri/src/commands/dns.rs` | Create | Tauri commands: `get_dns_settings`, `update_dns_config`, `add_dns_rule`, `delete_dns_rule`, `add_dns_server`, `delete_dns_server` |
| `src-tauri/src/singbox/mod.rs` | Modify | Add `pub mod dns_storage;` |
| `src-tauri/src/commands/mod.rs` | Modify | Add `pub mod dns;` |
| `src-tauri/src/lib.rs` | Modify | Register DNS commands in `invoke_handler` |
| `src-tauri/src/singbox/config.rs` | Modify | Read DNS settings and generate DNS section dynamically |

### Frontend (TypeScript/React)
| File | Action | Responsibility |
|------|--------|----------------|
| `src/services/types.ts` | Modify | Update `DnsRule` with `matchType`/`matchValue`, remove `DnsCacheEntry` |
| `src/services/dns.ts` | Modify | Add Tauri implementation, update interface (remove cache methods, add server CRUD) |
| `src/stores/dns.ts` | Modify | Remove cache state/methods, add server CRUD methods |
| `src/pages/DnsPage.tsx` | Modify | Remove cache tab, add match-type to rules, add preset server picker, add fake-ip TUN warning |

---

### Task 1: Rust DNS Storage Types and Persistence

**Files:**
- Create: `src-tauri/src/singbox/dns_storage.rs`
- Modify: `src-tauri/src/singbox/mod.rs`

- [ ] **Step 1: Create `dns_storage.rs` with types and defaults**

```rust
// src-tauri/src/singbox/dns_storage.rs
use serde::{Deserialize, Serialize};

use super::storage::{read_json, write_json};

const DNS_FILE: &str = "dns.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DnsSettings {
    pub mode: String,
    pub fake_ip_range: String,
    pub servers: Vec<DnsServerConfig>,
    pub rules: Vec<DnsRuleConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DnsServerConfig {
    pub id: String,
    pub name: String,
    pub address: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DnsRuleConfig {
    pub id: String,
    pub match_type: String,
    pub match_value: String,
    pub server: String,
    pub enabled: bool,
}

impl Default for DnsSettings {
    fn default() -> Self {
        Self {
            mode: "redir-host".to_string(),
            fake_ip_range: "198.18.0.0/15".to_string(),
            servers: vec![
                DnsServerConfig {
                    id: "cf-https".to_string(),
                    name: "Cloudflare".to_string(),
                    address: "https://1.1.1.1/dns-query".to_string(),
                    enabled: true,
                },
                DnsServerConfig {
                    id: "ali-udp".to_string(),
                    name: "AliDNS".to_string(),
                    address: "223.5.5.5".to_string(),
                    enabled: true,
                },
            ],
            rules: vec![
                DnsRuleConfig {
                    id: "cn-rule".to_string(),
                    match_type: "domain-suffix".to_string(),
                    match_value: ".cn".to_string(),
                    server: "ali-udp".to_string(),
                    enabled: true,
                },
            ],
        }
    }
}

pub fn load_dns_settings() -> DnsSettings {
    read_json(DNS_FILE)
}

pub fn save_dns_settings(settings: &DnsSettings) -> Result<(), String> {
    write_json(DNS_FILE, settings)
}
```

- [ ] **Step 2: Add module to `singbox/mod.rs`**

Add `pub mod dns_storage;` to `src-tauri/src/singbox/mod.rs`:

```rust
pub mod storage;
pub mod clash_api;
pub mod process;
pub mod config;
pub mod dns_storage;
```

- [ ] **Step 3: Verify it compiles**

Run: `cd /Users/linqiankai/calamity && cargo check --manifest-path src-tauri/Cargo.toml 2>&1 | tail -5`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/singbox/dns_storage.rs src-tauri/src/singbox/mod.rs
git commit -m "feat: add DNS storage types and persistence (dns.json)"
```

---

### Task 2: Rust DNS Tauri Commands

**Files:**
- Create: `src-tauri/src/commands/dns.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Create `commands/dns.rs`**

```rust
// src-tauri/src/commands/dns.rs
use std::sync::Arc;
use tauri::{AppHandle, Manager};

use crate::singbox::dns_storage::{self, DnsRuleConfig, DnsServerConfig, DnsSettings};
use crate::singbox::process::SingboxProcess;
use crate::singbox::storage;

#[tauri::command]
pub async fn get_dns_settings() -> Result<DnsSettings, String> {
    Ok(dns_storage::load_dns_settings())
}

#[tauri::command]
pub async fn update_dns_config(
    app: AppHandle,
    mode: Option<String>,
    fake_ip_range: Option<String>,
) -> Result<DnsSettings, String> {
    let mut settings = dns_storage::load_dns_settings();
    if let Some(m) = mode {
        settings.mode = m;
    }
    if let Some(r) = fake_ip_range {
        settings.fake_ip_range = r;
    }
    dns_storage::save_dns_settings(&settings)?;
    restart_if_running(&app).await;
    Ok(settings)
}

#[tauri::command]
pub async fn add_dns_server(
    app: AppHandle,
    server: DnsServerConfig,
) -> Result<DnsSettings, String> {
    let mut settings = dns_storage::load_dns_settings();
    settings.servers.push(server);
    dns_storage::save_dns_settings(&settings)?;
    restart_if_running(&app).await;
    Ok(settings)
}

#[tauri::command]
pub async fn update_dns_server(
    app: AppHandle,
    server: DnsServerConfig,
) -> Result<DnsSettings, String> {
    let mut settings = dns_storage::load_dns_settings();
    if let Some(s) = settings.servers.iter_mut().find(|s| s.id == server.id) {
        *s = server;
    }
    dns_storage::save_dns_settings(&settings)?;
    restart_if_running(&app).await;
    Ok(settings)
}

#[tauri::command]
pub async fn delete_dns_server(
    app: AppHandle,
    id: String,
) -> Result<DnsSettings, String> {
    let mut settings = dns_storage::load_dns_settings();
    settings.servers.retain(|s| s.id != id);
    // Also remove rules referencing this server
    settings.rules.retain(|r| r.server != id);
    dns_storage::save_dns_settings(&settings)?;
    restart_if_running(&app).await;
    Ok(settings)
}

#[tauri::command]
pub async fn add_dns_rule(
    app: AppHandle,
    rule: DnsRuleConfig,
) -> Result<DnsSettings, String> {
    let mut settings = dns_storage::load_dns_settings();
    settings.rules.push(rule);
    dns_storage::save_dns_settings(&settings)?;
    restart_if_running(&app).await;
    Ok(settings)
}

#[tauri::command]
pub async fn delete_dns_rule(
    app: AppHandle,
    id: String,
) -> Result<DnsSettings, String> {
    let mut settings = dns_storage::load_dns_settings();
    settings.rules.retain(|r| r.id != id);
    dns_storage::save_dns_settings(&settings)?;
    restart_if_running(&app).await;
    Ok(settings)
}

async fn restart_if_running(app: &AppHandle) {
    let process = app.state::<Arc<SingboxProcess>>().inner().clone();
    if process.is_running().await {
        let app_settings = storage::load_settings();
        let _ = process.restart(&app_settings).await;
    }
}
```

- [ ] **Step 2: Add module to `commands/mod.rs`**

```rust
pub mod logs;
pub mod connection;
pub mod settings;
pub mod dns;
```

- [ ] **Step 3: Register commands in `lib.rs`**

In `src-tauri/src/lib.rs`, add DNS commands to the `invoke_handler`:

```rust
        .invoke_handler(tauri::generate_handler![
            commands::logs::start_log_stream,
            commands::connection::singbox_start,
            commands::connection::singbox_stop,
            commands::connection::singbox_restart,
            commands::connection::singbox_status,
            commands::settings::get_settings,
            commands::settings::update_settings,
            commands::dns::get_dns_settings,
            commands::dns::update_dns_config,
            commands::dns::add_dns_server,
            commands::dns::update_dns_server,
            commands::dns::delete_dns_server,
            commands::dns::add_dns_rule,
            commands::dns::delete_dns_rule,
        ])
```

- [ ] **Step 4: Verify it compiles**

Run: `cd /Users/linqiankai/calamity && cargo check --manifest-path src-tauri/Cargo.toml 2>&1 | tail -5`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/dns.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs
git commit -m "feat: add DNS Tauri commands (CRUD for servers and rules)"
```

---

### Task 3: Dynamic DNS Config Generation

**Files:**
- Modify: `src-tauri/src/singbox/config.rs`

- [ ] **Step 1: Update `generate_config` to read DNS settings**

Replace the hardcoded DNS section in `config.rs` with dynamic generation:

```rust
use serde_json::{json, Value};

use super::dns_storage;
use super::storage::AppSettings;

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

    let dns_settings = dns_storage::load_dns_settings();
    let dns_section = build_dns_section(&dns_settings);

    // Find the first enabled server tag to use as default_domain_resolver
    let default_resolver = dns_settings
        .servers
        .iter()
        .find(|s| s.enabled)
        .map(|s| s.id.clone())
        .unwrap_or_else(|| "cf-https".to_string());

    json!({
        "log": {
            "level": settings.log_level,
            "timestamp": true
        },
        "dns": dns_section,
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
                "server": default_resolver
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

fn build_dns_section(dns: &dns_storage::DnsSettings) -> Value {
    let servers: Vec<Value> = dns
        .servers
        .iter()
        .filter(|s| s.enabled)
        .map(|s| parse_server_address(s))
        .collect();

    let rules: Vec<Value> = dns
        .rules
        .iter()
        .filter(|r| r.enabled)
        .filter_map(|r| build_dns_rule(r))
        .collect();

    let mut section = json!({
        "servers": servers,
        "rules": rules
    });

    if dns.mode == "fake-ip" {
        section["fakeip"] = json!({
            "enabled": true,
            "inet4_range": dns.fake_ip_range
        });
    }

    section
}

fn parse_server_address(server: &dns_storage::DnsServerConfig) -> Value {
    let addr = &server.address;

    if addr.starts_with("https://") {
        // "https://1.1.1.1/dns-query" → type: https, server: 1.1.1.1, path: /dns-query
        let without_scheme = &addr[8..];
        let (host_port, path) = without_scheme
            .find('/')
            .map(|i| (&without_scheme[..i], &without_scheme[i..]))
            .unwrap_or((without_scheme, "/dns-query"));

        let (host, port) = if let Some(colon) = host_port.rfind(':') {
            (&host_port[..colon], host_port[colon + 1..].parse::<u16>().unwrap_or(443))
        } else {
            (host_port, 443u16)
        };

        json!({
            "type": "https",
            "tag": server.id,
            "server": host,
            "server_port": port,
            "path": path
        })
    } else if addr.starts_with("tls://") {
        // "tls://8.8.8.8" → type: tls, server: 8.8.8.8, port: 853
        let host = &addr[6..];
        json!({
            "type": "tls",
            "tag": server.id,
            "server": host,
            "server_port": 853
        })
    } else {
        // Plain IP → type: udp
        json!({
            "type": "udp",
            "tag": server.id,
            "server": addr
        })
    }
}

fn build_dns_rule(rule: &dns_storage::DnsRuleConfig) -> Option<Value> {
    let key = match rule.match_type.as_str() {
        "domain" => "domain",
        "domain-suffix" => "domain_suffix",
        "domain-keyword" => "domain_keyword",
        "domain-regex" => "domain_regex",
        _ => return None,
    };

    Some(json!({
        key: [rule.match_value],
        "server": rule.server
    }))
}
```

- [ ] **Step 2: Remove old `use` of `storage` module (no longer needed for config path)**

The `use super::storage::{self, AppSettings};` becomes `use super::storage::AppSettings;` since we removed the `storage::` prefix on `singbox_config_path`. Actually, `write_config` still needs `storage::singbox_config_path()`, so keep `self`:

```rust
use super::storage::{self, AppSettings};
```

No change needed — keep the existing import. The `write_config` function at the bottom stays as-is.

- [ ] **Step 3: Verify it compiles**

Run: `cd /Users/linqiankai/calamity && cargo check --manifest-path src-tauri/Cargo.toml 2>&1 | tail -5`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/singbox/config.rs
git commit -m "feat: generate DNS config dynamically from dns.json"
```

---

### Task 4: Update Frontend Types

**Files:**
- Modify: `src/services/types.ts`

- [ ] **Step 1: Update `DnsRule` type to support match types**

Replace the existing `DnsRule` interface (lines 213-218) with:

```typescript
export interface DnsRule {
  id: string;
  matchType: "domain" | "domain-suffix" | "domain-keyword" | "domain-regex";
  matchValue: string;
  server: string; // server id
  enabled: boolean;
}
```

- [ ] **Step 2: Remove `DnsCacheEntry` type**

Delete the `DnsCacheEntry` interface (lines 220-225):

```typescript
// DELETE THIS:
export interface DnsCacheEntry {
  domain: string;
  ip: string;
  ttl: number;
  type: string;
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd /Users/linqiankai/calamity && npx tsc --noEmit 2>&1 | head -20`
Expected: errors in dns.ts/stores/DnsPage (expected — we fix those next)

- [ ] **Step 4: Commit**

```bash
git add src/services/types.ts
git commit -m "feat: update DnsRule type with matchType, remove DnsCacheEntry"
```

---

### Task 5: Update Frontend DNS Service

**Files:**
- Modify: `src/services/dns.ts`

- [ ] **Step 1: Rewrite DNS service with Tauri + mock implementations**

Replace the entire contents of `src/services/dns.ts`:

```typescript
import type { DnsConfig, DnsRule, DnsServer } from "./types";

export interface DnsService {
  getSettings(): Promise<{ config: DnsConfig; rules: DnsRule[] }>;
  updateConfig(updates: { mode?: string; fakeIpRange?: string }): Promise<{ config: DnsConfig; rules: DnsRule[] }>;
  addServer(server: DnsServer): Promise<{ config: DnsConfig; rules: DnsRule[] }>;
  updateServer(server: DnsServer): Promise<{ config: DnsConfig; rules: DnsRule[] }>;
  deleteServer(id: string): Promise<{ config: DnsConfig; rules: DnsRule[] }>;
  addRule(rule: DnsRule): Promise<{ config: DnsConfig; rules: DnsRule[] }>;
  deleteRule(id: string): Promise<{ config: DnsConfig; rules: DnsRule[] }>;
}

// ---- Helper: split DnsSettings into config + rules ----

interface RawDnsSettings {
  mode: string;
  fakeIpRange: string;
  servers: DnsServer[];
  rules: DnsRule[];
}

function splitSettings(raw: RawDnsSettings): { config: DnsConfig; rules: DnsRule[] } {
  return {
    config: {
      mode: raw.mode as DnsConfig["mode"],
      fakeIpRange: raw.fakeIpRange,
      servers: raw.servers,
    },
    rules: raw.rules,
  };
}

// ---- Mock Implementation ----

let mockData: RawDnsSettings = {
  mode: "redir-host",
  fakeIpRange: "198.18.0.0/15",
  servers: [
    { id: "cf-https", name: "Cloudflare", address: "https://1.1.1.1/dns-query", enabled: true },
    { id: "ali-udp", name: "AliDNS", address: "223.5.5.5", enabled: true },
  ],
  rules: [
    { id: "cn-rule", matchType: "domain-suffix", matchValue: ".cn", server: "ali-udp", enabled: true },
  ],
};

let ruleId = 100;

const mockDnsService: DnsService = {
  async getSettings() {
    return splitSettings(JSON.parse(JSON.stringify(mockData)));
  },
  async updateConfig(updates) {
    if (updates.mode) mockData.mode = updates.mode;
    if (updates.fakeIpRange) mockData.fakeIpRange = updates.fakeIpRange;
    return splitSettings(JSON.parse(JSON.stringify(mockData)));
  },
  async addServer(server) {
    mockData.servers.push(server);
    return splitSettings(JSON.parse(JSON.stringify(mockData)));
  },
  async updateServer(server) {
    mockData.servers = mockData.servers.map((s) => (s.id === server.id ? server : s));
    return splitSettings(JSON.parse(JSON.stringify(mockData)));
  },
  async deleteServer(id) {
    mockData.servers = mockData.servers.filter((s) => s.id !== id);
    mockData.rules = mockData.rules.filter((r) => r.server !== id);
    return splitSettings(JSON.parse(JSON.stringify(mockData)));
  },
  async addRule(rule) {
    mockData.rules.push({ ...rule, id: `dr${ruleId++}` });
    return splitSettings(JSON.parse(JSON.stringify(mockData)));
  },
  async deleteRule(id) {
    mockData.rules = mockData.rules.filter((r) => r.id !== id);
    return splitSettings(JSON.parse(JSON.stringify(mockData)));
  },
};

// ---- Tauri Implementation ----

function createTauriDnsService(): DnsService {
  return {
    async getSettings() {
      const { invoke } = await import("@tauri-apps/api/core");
      const raw = await invoke<RawDnsSettings>("get_dns_settings");
      return splitSettings(raw);
    },
    async updateConfig(updates) {
      const { invoke } = await import("@tauri-apps/api/core");
      const raw = await invoke<RawDnsSettings>("update_dns_config", updates);
      return splitSettings(raw);
    },
    async addServer(server) {
      const { invoke } = await import("@tauri-apps/api/core");
      const raw = await invoke<RawDnsSettings>("add_dns_server", { server });
      return splitSettings(raw);
    },
    async updateServer(server) {
      const { invoke } = await import("@tauri-apps/api/core");
      const raw = await invoke<RawDnsSettings>("update_dns_server", { server });
      return splitSettings(raw);
    },
    async deleteServer(id) {
      const { invoke } = await import("@tauri-apps/api/core");
      const raw = await invoke<RawDnsSettings>("delete_dns_server", { id });
      return splitSettings(raw);
    },
    async addRule(rule) {
      const { invoke } = await import("@tauri-apps/api/core");
      const raw = await invoke<RawDnsSettings>("add_dns_rule", { rule });
      return splitSettings(raw);
    },
    async deleteRule(id) {
      const { invoke } = await import("@tauri-apps/api/core");
      const raw = await invoke<RawDnsSettings>("delete_dns_rule", { id });
      return splitSettings(raw);
    },
  };
}

// ---- Export ----

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
export const dnsService: DnsService = isTauri ? createTauriDnsService() : mockDnsService;
```

- [ ] **Step 2: Commit**

```bash
git add src/services/dns.ts
git commit -m "feat: add Tauri DNS service with mock fallback"
```

---

### Task 6: Update DNS Store

**Files:**
- Modify: `src/stores/dns.ts`

- [ ] **Step 1: Rewrite DNS store (remove cache, add server CRUD)**

Replace the entire contents of `src/stores/dns.ts`:

```typescript
import { create } from "zustand";
import { dnsService } from "../services/dns";
import type { DnsConfig, DnsRule, DnsServer } from "../services/types";

interface DnsStore {
  config: DnsConfig | null;
  rules: DnsRule[];
  fetchAll: () => Promise<void>;
  updateConfig: (updates: { mode?: string; fakeIpRange?: string }) => Promise<void>;
  addServer: (server: DnsServer) => Promise<void>;
  updateServer: (server: DnsServer) => Promise<void>;
  deleteServer: (id: string) => Promise<void>;
  addRule: (rule: DnsRule) => Promise<void>;
  deleteRule: (id: string) => Promise<void>;
}

export const useDnsStore = create<DnsStore>((set) => ({
  config: null,
  rules: [],

  async fetchAll() {
    const { config, rules } = await dnsService.getSettings();
    set({ config, rules });
  },
  async updateConfig(updates) {
    const { config, rules } = await dnsService.updateConfig(updates);
    set({ config, rules });
  },
  async addServer(server) {
    const { config, rules } = await dnsService.addServer(server);
    set({ config, rules });
  },
  async updateServer(server) {
    const { config, rules } = await dnsService.updateServer(server);
    set({ config, rules });
  },
  async deleteServer(id) {
    const { config, rules } = await dnsService.deleteServer(id);
    set({ config, rules });
  },
  async addRule(rule) {
    const { config, rules } = await dnsService.addRule(rule);
    set({ config, rules });
  },
  async deleteRule(id) {
    const { config, rules } = await dnsService.deleteRule(id);
    set({ config, rules });
  },
}));
```

- [ ] **Step 2: Commit**

```bash
git add src/stores/dns.ts
git commit -m "feat: update DNS store with server/rule CRUD, remove cache"
```

---

### Task 7: Update DNS Page UI

**Files:**
- Modify: `src/pages/DnsPage.tsx`

- [ ] **Step 1: Rewrite DnsPage — remove cache tab, add match-type rules, preset servers, fake-ip TUN warning**

Replace the entire contents of `src/pages/DnsPage.tsx`:

```tsx
import { useEffect, useState } from "react";
import { Plus, Trash2, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDnsStore } from "@/stores/dns";
import type { DnsMode } from "@/services/types";

const PRESET_SERVERS = [
  { id: "cf-https", name: "Cloudflare", address: "https://1.1.1.1/dns-query" },
  { id: "cf-tls", name: "Cloudflare TLS", address: "tls://1.1.1.1" },
  { id: "google-https", name: "Google", address: "https://8.8.8.8/dns-query" },
  { id: "google-tls", name: "Google TLS", address: "tls://8.8.8.8" },
  { id: "ali-udp", name: "AliDNS", address: "223.5.5.5" },
  { id: "ali-https", name: "AliDNS HTTPS", address: "https://223.5.5.5/dns-query" },
  { id: "dnspod-https", name: "DNSPod", address: "https://1.12.12.12/dns-query" },
] as const;

const MATCH_TYPES = [
  { value: "domain", label: "Domain" },
  { value: "domain-suffix", label: "Domain Suffix" },
  { value: "domain-keyword", label: "Domain Keyword" },
  { value: "domain-regex", label: "Domain Regex" },
] as const;

export function DnsPage() {
  const {
    config,
    rules,
    fetchAll,
    updateConfig,
    addServer,
    updateServer,
    deleteServer,
    addRule,
    deleteRule,
  } = useDnsStore();

  const [newMatchType, setNewMatchType] = useState("domain-suffix");
  const [newMatchValue, setNewMatchValue] = useState("");
  const [newRuleServer, setNewRuleServer] = useState("");
  const [showPresets, setShowPresets] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customAddress, setCustomAddress] = useState("");

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  if (!config) return null;

  const existingServerIds = new Set(config.servers.map((s) => s.id));
  const availablePresets = PRESET_SERVERS.filter((p) => !existingServerIds.has(p.id));

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold animate-slide-up">DNS</h1>

      <Tabs defaultValue="config">
        <TabsList
          className="animate-slide-up bg-muted/30 border border-white/[0.06] backdrop-blur-xl rounded-full p-1"
          style={{ animationDelay: "80ms" }}
        >
          <TabsTrigger
            value="config"
            className="rounded-full text-xs px-4 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-[0_0_15px_rgba(254,151,185,0.15)] transition-all duration-200"
          >
            Configuration
          </TabsTrigger>
          <TabsTrigger
            value="rules"
            className="rounded-full text-xs px-4 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-[0_0_15px_rgba(254,151,185,0.15)] transition-all duration-200"
          >
            DNS Rules
          </TabsTrigger>
        </TabsList>

        {/* ---- Configuration Tab ---- */}
        <TabsContent value="config" className="space-y-4 mt-4">
          {/* DNS Mode */}
          <Card
            className="animate-slide-up rounded-xl border border-white/[0.06] bg-card/40 backdrop-blur-xl shadow-[0_0_20px_rgba(254,151,185,0.08)] transition-all duration-200 hover:border-white/10 hover:bg-card/80"
            style={{ animationDelay: "160ms" }}
          >
            <CardHeader>
              <CardTitle className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                DNS Mode
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Select
                value={config.mode}
                onValueChange={(v) => updateConfig({ mode: v as DnsMode })}
              >
                <SelectTrigger className="w-48 bg-muted/30 border-white/[0.06]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-white/[0.06] bg-card/90 backdrop-blur-2xl">
                  <SelectItem value="fake-ip">Fake-IP</SelectItem>
                  <SelectItem value="redir-host">Redir-Host</SelectItem>
                  <SelectItem value="direct">Direct</SelectItem>
                </SelectContent>
              </Select>
              {config.mode === "fake-ip" && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Fake-IP range: {config.fakeIpRange}
                  </p>
                  <div className="flex items-center gap-2 rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-yellow-500 shrink-0" />
                    <p className="text-[10px] text-yellow-500">
                      Fake-IP mode requires TUN to be enabled in Settings.
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* DNS Servers */}
          <Card
            className="animate-slide-up rounded-xl border border-white/[0.06] bg-card/40 backdrop-blur-xl shadow-[0_0_20px_rgba(254,151,185,0.08)] transition-all duration-200 hover:border-white/10 hover:bg-card/80"
            style={{ animationDelay: "240ms" }}
          >
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                DNS Servers
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                className="border-white/[0.06] hover:bg-white/[0.04] text-xs"
                onClick={() => setShowPresets(!showPresets)}
              >
                <Plus className="mr-1 h-3 w-3" />
                Add Server
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Preset picker */}
              {showPresets && (
                <div className="space-y-3 rounded-lg border border-white/[0.06] bg-muted/10 p-3">
                  {availablePresets.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                        Presets
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {availablePresets.map((preset) => (
                          <Badge
                            key={preset.id}
                            variant="outline"
                            className="cursor-pointer text-[10px] hover:bg-primary/10 transition-colors"
                            onClick={() => {
                              addServer({
                                id: preset.id,
                                name: preset.name,
                                address: preset.address,
                                enabled: true,
                              });
                            }}
                          >
                            <Plus className="mr-1 h-2.5 w-2.5" />
                            {preset.name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="space-y-1">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                      Custom
                    </p>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Name"
                        value={customName}
                        onChange={(e) => setCustomName(e.target.value)}
                        className="w-32 bg-muted/30 border-white/[0.06] text-xs"
                      />
                      <Input
                        placeholder="Address (e.g. https://... or tls://... or IP)"
                        value={customAddress}
                        onChange={(e) => setCustomAddress(e.target.value)}
                        className="flex-1 bg-muted/30 border-white/[0.06] text-xs"
                      />
                      <Button
                        size="sm"
                        disabled={!customName || !customAddress}
                        onClick={() => {
                          const id = `custom-${Date.now()}`;
                          addServer({
                            id,
                            name: customName,
                            address: customAddress,
                            enabled: true,
                          });
                          setCustomName("");
                          setCustomAddress("");
                        }}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Server list */}
              {config.servers.map((server) => (
                <div
                  key={server.id}
                  className="flex items-center gap-3 rounded-lg border border-white/[0.04] bg-muted/20 p-3 transition-all duration-200 hover:bg-muted/30"
                >
                  <Switch
                    checked={server.enabled}
                    onCheckedChange={(checked) => {
                      updateServer({ ...server, enabled: checked });
                    }}
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{server.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{server.address}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:bg-red-500/10 transition-all duration-200"
                    onClick={() => deleteServer(server.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---- Rules Tab ---- */}
        <TabsContent value="rules" className="space-y-4 mt-4">
          <Card
            className="animate-slide-up rounded-xl border border-white/[0.06] bg-card/40 backdrop-blur-xl shadow-[0_0_20px_rgba(254,151,185,0.08)]"
            style={{ animationDelay: "160ms" }}
          >
            <CardHeader>
              <CardTitle className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                DNS Rules
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Add rule form */}
              <div className="flex gap-2">
                <Select value={newMatchType} onValueChange={setNewMatchType}>
                  <SelectTrigger className="w-40 bg-muted/30 border-white/[0.06] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-white/[0.06] bg-card/90 backdrop-blur-2xl">
                    {MATCH_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Value (e.g. .cn)"
                  value={newMatchValue}
                  onChange={(e) => setNewMatchValue(e.target.value)}
                  className="flex-1 bg-muted/30 border-white/[0.06] text-xs"
                />
                <Select value={newRuleServer} onValueChange={setNewRuleServer}>
                  <SelectTrigger className="w-40 bg-muted/30 border-white/[0.06] text-xs">
                    <SelectValue placeholder="Server" />
                  </SelectTrigger>
                  <SelectContent className="border-white/[0.06] bg-card/90 backdrop-blur-2xl">
                    {config.servers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="icon"
                  className="shadow-[0_0_15px_rgba(254,151,185,0.15)] transition-all duration-200"
                  disabled={!newMatchValue || !newRuleServer}
                  onClick={() => {
                    addRule({
                      id: `dr-${Date.now()}`,
                      matchType: newMatchType as "domain" | "domain-suffix" | "domain-keyword" | "domain-regex",
                      matchValue: newMatchValue,
                      server: newRuleServer,
                      enabled: true,
                    });
                    setNewMatchValue("");
                    setNewRuleServer("");
                  }}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              {/* Rules list */}
              <div className="space-y-2">
                {rules.map((rule) => {
                  const serverName =
                    config.servers.find((s) => s.id === rule.server)?.name ?? rule.server;
                  const matchLabel =
                    MATCH_TYPES.find((t) => t.value === rule.matchType)?.label ?? rule.matchType;
                  return (
                    <div
                      key={rule.id}
                      className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-muted/20 p-3 transition-all duration-200 hover:border-white/10 hover:bg-muted/30"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className="text-[10px] border-white/[0.06] bg-muted/30"
                          >
                            {matchLabel}
                          </Badge>
                          <p className="text-sm font-mono">{rule.matchValue}</p>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">→ {serverName}</p>
                      </div>
                      <Badge
                        className={
                          rule.enabled
                            ? "bg-green-500/15 text-green-400 border-0"
                            : "bg-muted/40 text-muted-foreground border-0"
                        }
                      >
                        {rule.enabled ? "Active" : "Disabled"}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:bg-red-500/10 transition-all duration-200"
                        onClick={() => deleteRule(rule.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  );
                })}
                {rules.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No DNS rules configured
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/linqiankai/calamity && npx tsc --noEmit 2>&1 | head -20`
Expected: no errors

- [ ] **Step 3: Run all tests**

Run: `cd /Users/linqiankai/calamity && npx vitest run 2>&1 | tail -20`
Expected: all tests pass

- [ ] **Step 4: Commit**

```bash
git add src/pages/DnsPage.tsx
git commit -m "feat: update DNS page — remove cache tab, add match-type rules, preset servers, TUN warning"
```

---

### Task 8: Final Verification

- [ ] **Step 1: Verify Rust compiles clean**

Run: `cd /Users/linqiankai/calamity && cargo check --manifest-path src-tauri/Cargo.toml 2>&1 | tail -10`
Expected: no errors or warnings

- [ ] **Step 2: Verify TypeScript compiles clean**

Run: `cd /Users/linqiankai/calamity && npx tsc --noEmit 2>&1`
Expected: no errors

- [ ] **Step 3: Run all frontend tests**

Run: `cd /Users/linqiankai/calamity && npx vitest run 2>&1 | tail -20`
Expected: all tests pass

- [ ] **Step 4: Verify dns.json defaults by checking config generation logic**

The first time the app runs with no `dns.json`, `load_dns_settings()` returns `Default::default()` which includes Cloudflare HTTPS + AliDNS UDP servers and the `.cn` suffix rule. `generate_config()` reads this and produces a valid sing-box DNS section with proper server types.
