# Route Rules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the mock rules service with a real Tauri backend that persists route rules to disk, generates sing-box route config with rules and rule_sets, and hot-reloads sing-box via SIGHUP.

**Architecture:** New `rules_storage.rs` persists rules to `rules.json` (following the dns_storage pattern). New `commands/rules.rs` exposes CRUD + reorder Tauri commands. `config.rs` generates `route.rules` and `route.rule_set` arrays from stored rules. `process.rs` gains a `reload()` method that sends SIGHUP instead of full restart. Frontend `services/rules.ts` swaps mock for Tauri invoke calls. Rule set files (`.srs`) are auto-downloaded to app data dir with configurable update interval.

**Tech Stack:** Rust (Tauri, serde, reqwest, tokio), TypeScript (Zustand, Tauri API)

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src-tauri/src/singbox/rules_storage.rs` | Create | RouteRule struct, load/save rules.json |
| `src-tauri/src/singbox/mod.rs` | Modify | Add `pub mod rules_storage` |
| `src-tauri/src/commands/rules.rs` | Create | Tauri commands: CRUD + reorder + rule set download |
| `src-tauri/src/commands/mod.rs` | Modify | Add `pub mod rules` |
| `src-tauri/src/singbox/config.rs` | Modify | Generate route.rules and route.rule_set arrays |
| `src-tauri/src/singbox/process.rs` | Modify | Add `reload()` method (SIGHUP) |
| `src-tauri/src/lib.rs` | Modify | Register rules commands |
| `src/services/rules.ts` | Modify | Replace mock with Tauri invoke calls |
| `src/pages/RulesPage.tsx` | Modify | Remove tailnet option, use dynamic node list for download detour |

---

### Task 1: Rules Storage (Rust)

**Files:**
- Create: `src-tauri/src/singbox/rules_storage.rs`
- Modify: `src-tauri/src/singbox/mod.rs`

- [ ] **Step 1: Create `rules_storage.rs` with data structures and load/save**

```rust
// src-tauri/src/singbox/rules_storage.rs
use serde::{Deserialize, Serialize};

use super::storage::{read_json, write_json};

const RULES_FILE: &str = "rules.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RouteRuleConfig {
    pub id: String,
    pub name: String,
    pub enabled: bool,
    pub match_type: String,
    pub match_value: String,
    pub outbound: String,          // "proxy" | "direct" | "reject"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub outbound_node: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rule_set_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rule_set_local_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub download_detour: Option<String>,
    pub order: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RulesData {
    pub rules: Vec<RouteRuleConfig>,
    /// Auto-update interval in seconds (0 = disabled). Default: 86400 (24h)
    #[serde(default = "default_update_interval")]
    pub update_interval: u64,
}

fn default_update_interval() -> u64 {
    86400
}

pub fn load_rules() -> RulesData {
    read_json(RULES_FILE)
}

pub fn save_rules(data: &RulesData) -> Result<(), String> {
    write_json(RULES_FILE, data)
}
```

- [ ] **Step 2: Add module to `mod.rs`**

Add to `src-tauri/src/singbox/mod.rs`:
```rust
pub mod rules_storage;
```

- [ ] **Step 3: Verify it compiles**

Run: `cd /Users/linqiankai/calamity && cargo check --manifest-path src-tauri/Cargo.toml`
Expected: compiles with no errors

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/singbox/rules_storage.rs src-tauri/src/singbox/mod.rs
git commit -m "feat: add rules_storage.rs for route rule persistence"
```

---

### Task 2: SIGHUP Reload in process.rs

**Files:**
- Modify: `src-tauri/src/singbox/process.rs`

- [ ] **Step 1: Add `reload()` method to SingboxProcess**

Add this method after the `restart` method in `src-tauri/src/singbox/process.rs`:

```rust
    /// Hot-reload config by writing new config and sending SIGHUP to sing-box process.
    /// Falls back to full restart if SIGHUP fails or no managed child exists.
    pub async fn reload(&self, settings: &AppSettings) -> Result<(), String> {
        config::write_config(settings)?;

        let guard = self.child.lock().await;
        if let Some(ref child) = *guard {
            if let Some(pid) = child.id() {
                #[cfg(unix)]
                {
                    let ret = unsafe { libc::kill(pid as i32, libc::SIGHUP) };
                    if ret == 0 {
                        eprintln!("[singbox] sent SIGHUP to pid {}", pid);
                        drop(guard);
                        // Wait briefly for sing-box to reload
                        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
                        return Ok(());
                    }
                    eprintln!("[singbox] SIGHUP failed (ret={}), falling back to restart", ret);
                }
                #[cfg(not(unix))]
                {
                    eprintln!("[singbox] SIGHUP not supported on this platform, falling back to restart");
                }
            }
        }
        drop(guard);
        self.restart(settings).await
    }
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /Users/linqiankai/calamity && cargo check --manifest-path src-tauri/Cargo.toml`
Expected: compiles with no errors

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/singbox/process.rs
git commit -m "feat: add reload() method with SIGHUP for hot config reload"
```

---

### Task 3: Tauri Commands for Rules

**Files:**
- Create: `src-tauri/src/commands/rules.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Create `commands/rules.rs`**

```rust
// src-tauri/src/commands/rules.rs
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};

use crate::singbox::rules_storage::{self, RouteRuleConfig, RulesData};
use crate::singbox::process::SingboxProcess;
use crate::singbox::storage;

#[tauri::command]
pub async fn get_rules() -> Result<RulesData, String> {
    Ok(rules_storage::load_rules())
}

#[tauri::command]
pub async fn add_rule(app: AppHandle, rule: RouteRuleConfig) -> Result<RulesData, String> {
    let mut data = rules_storage::load_rules();
    data.rules.push(rule);
    reindex(&mut data);
    rules_storage::save_rules(&data)?;
    reload_singbox(&app).await;
    Ok(data)
}

#[tauri::command]
pub async fn update_rule(app: AppHandle, rule: RouteRuleConfig) -> Result<RulesData, String> {
    let mut data = rules_storage::load_rules();
    if let Some(existing) = data.rules.iter_mut().find(|r| r.id == rule.id) {
        *existing = rule;
    }
    rules_storage::save_rules(&data)?;
    reload_singbox(&app).await;
    Ok(data)
}

#[tauri::command]
pub async fn delete_rule(app: AppHandle, id: String) -> Result<RulesData, String> {
    let mut data = rules_storage::load_rules();
    data.rules.retain(|r| r.id != id);
    reindex(&mut data);
    rules_storage::save_rules(&data)?;
    reload_singbox(&app).await;
    Ok(data)
}

#[tauri::command]
pub async fn reorder_rules(app: AppHandle, ordered_ids: Vec<String>) -> Result<RulesData, String> {
    let mut data = rules_storage::load_rules();
    data.rules.sort_by_key(|r| {
        ordered_ids.iter().position(|id| id == &r.id).unwrap_or(usize::MAX)
    });
    reindex(&mut data);
    rules_storage::save_rules(&data)?;
    reload_singbox(&app).await;
    Ok(data)
}

#[tauri::command]
pub async fn update_ruleset_interval(
    app: AppHandle,
    interval: u64,
) -> Result<RulesData, String> {
    let mut data = rules_storage::load_rules();
    data.update_interval = interval;
    rules_storage::save_rules(&data)?;
    reload_singbox(&app).await;
    Ok(data)
}

fn reindex(data: &mut RulesData) {
    for (i, rule) in data.rules.iter_mut().enumerate() {
        rule.order = i;
    }
}

async fn reload_singbox(app: &AppHandle) {
    let process = app.state::<Arc<SingboxProcess>>().inner().clone();
    let settings = storage::load_settings();
    match process.reload(&settings).await {
        Ok(()) => {
            eprintln!("[rules] sing-box reloaded successfully");
            let _ = app.emit("singbox-reloaded", ());
        }
        Err(e) => {
            eprintln!("[rules] sing-box reload failed: {}", e);
            let _ = app.emit("singbox-error", &e);
        }
    }
}
```

- [ ] **Step 2: Add module to `commands/mod.rs`**

Add to `src-tauri/src/commands/mod.rs`:
```rust
pub mod rules;
```

- [ ] **Step 3: Register commands in `lib.rs`**

Add these to the `invoke_handler` in `src-tauri/src/lib.rs`:
```rust
            commands::rules::get_rules,
            commands::rules::add_rule,
            commands::rules::update_rule,
            commands::rules::delete_rule,
            commands::rules::reorder_rules,
            commands::rules::update_ruleset_interval,
```

Note: `get_rules` conflicts with the name of the existing `get_nodes` command — no conflict. But the Tauri command name is derived from the function name. Since `get_rules` is in a different module, the function names are unique.

- [ ] **Step 4: Verify it compiles**

Run: `cd /Users/linqiankai/calamity && cargo check --manifest-path src-tauri/Cargo.toml`
Expected: compiles with no errors

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/rules.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs
git commit -m "feat: add Tauri commands for route rules CRUD"
```

---

### Task 4: Config Generation — Route Rules and Rule Sets

**Files:**
- Modify: `src-tauri/src/singbox/config.rs`

- [ ] **Step 1: Add route rules and rule_set generation to `generate_config`**

In `src-tauri/src/singbox/config.rs`, add `use super::rules_storage;` at the top with the other imports.

Then replace the existing `"route"` section in the `json!({...})` block (around line 99) with code that builds route rules and rule sets.

Replace this block:
```rust
    json!({
        "log": {
            "level": settings.log_level,
            "timestamp": true
        },
        "dns": dns_section,
        "inbounds": inbounds,
        "outbounds": outbound_list,
        "route": {
            "auto_detect_interface": true,
            "final": route_final,
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
```

With:
```rust
    // Build route rules from stored rules
    let rules_data = rules_storage::load_rules();
    let (route_rules, rule_sets) = build_route_rules(&rules_data, &all_node_tags);

    let mut route_section = json!({
        "auto_detect_interface": true,
        "final": route_final,
        "default_domain_resolver": {
            "server": default_resolver
        }
    });

    if !route_rules.is_empty() {
        route_section["rules"] = json!(route_rules);
    }
    if !rule_sets.is_empty() {
        route_section["rule_set"] = json!(rule_sets);
    }

    json!({
        "log": {
            "level": settings.log_level,
            "timestamp": true
        },
        "dns": dns_section,
        "inbounds": inbounds,
        "outbounds": outbound_list,
        "route": route_section,
        "experimental": {
            "clash_api": {
                "external_controller": "127.0.0.1:9091",
                "default_mode": "Rule"
            }
        }
    })
```

- [ ] **Step 2: Add `build_route_rules` function**

Add this function at the bottom of `config.rs`:

```rust
fn build_route_rules(
    rules_data: &rules_storage::RulesData,
    all_node_tags: &[String],
) -> (Vec<Value>, Vec<Value>) {
    let mut route_rules: Vec<Value> = Vec::new();
    let mut rule_sets: Vec<Value> = Vec::new();
    let mut seen_rule_sets: std::collections::HashSet<String> = std::collections::HashSet::new();

    for rule in &rules_data.rules {
        if !rule.enabled {
            continue;
        }

        let outbound_tag = resolve_outbound(&rule.outbound, &rule.outbound_node, all_node_tags);

        match rule.match_type.as_str() {
            "geosite" | "geoip" => {
                // Rule set based matching
                let rule_set_tag = format!("{}-{}", rule.match_type, rule.match_value);

                route_rules.push(json!({
                    "rule_set": rule_set_tag,
                    "outbound": outbound_tag
                }));

                if !seen_rule_sets.contains(&rule_set_tag) {
                    seen_rule_sets.insert(rule_set_tag.clone());

                    if let Some(local_path) = &rule.rule_set_local_path {
                        // Local rule set file
                        rule_sets.push(json!({
                            "tag": rule_set_tag,
                            "type": "local",
                            "format": "binary",
                            "path": local_path
                        }));
                    } else {
                        // Remote rule set
                        let url = rule.rule_set_url.clone().unwrap_or_else(|| {
                            let base = if rule.match_type == "geosite" {
                                "https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set"
                            } else {
                                "https://raw.githubusercontent.com/SagerNet/sing-geoip/rule-set"
                            };
                            format!("{}/{}-{}.srs", base, rule.match_type, rule.match_value)
                        });

                        let mut rs = json!({
                            "tag": rule_set_tag,
                            "type": "remote",
                            "format": "binary",
                            "url": url,
                            "update_interval": format!("{}s", rules_data.update_interval)
                        });

                        if let Some(detour) = &rule.download_detour {
                            let detour_tag = match detour.as_str() {
                                "direct" => "direct-out".to_string(),
                                "proxy" => all_node_tags.first().cloned().unwrap_or("direct-out".to_string()),
                                other => other.to_string(),
                            };
                            rs["download_detour"] = json!(detour_tag);
                        }

                        rule_sets.push(rs);
                    }
                }
            }
            _ => {
                // Direct match rules
                let key = match rule.match_type.as_str() {
                    "domain-suffix" => "domain_suffix",
                    "domain-keyword" => "domain_keyword",
                    "domain-full" => "domain",
                    "domain-regex" => "domain_regex",
                    "ip-cidr" => "ip_cidr",
                    "process-name" => "process_name",
                    "process-path" => "process_path",
                    "process-path-regex" => "process_path_regex",
                    "port" => "port",
                    "port-range" => "port_range",
                    "network" => "network",
                    _ => continue,
                };

                // Some fields are arrays in sing-box, some are single values
                let value: Value = match rule.match_type.as_str() {
                    "port" => {
                        // port can be a single int or array
                        if let Ok(p) = rule.match_value.parse::<u16>() {
                            json!([p])
                        } else {
                            // comma-separated
                            let ports: Vec<u16> = rule.match_value
                                .split(',')
                                .filter_map(|s| s.trim().parse().ok())
                                .collect();
                            json!(ports)
                        }
                    }
                    "network" => {
                        // network is a single string "tcp" or "udp"
                        json!(rule.match_value)
                    }
                    _ => {
                        json!([&rule.match_value])
                    }
                };

                route_rules.push(json!({
                    key: value,
                    "outbound": outbound_tag
                }));
            }
        }
    }

    (route_rules, rule_sets)
}

fn resolve_outbound(outbound: &str, outbound_node: &Option<String>, all_node_tags: &[String]) -> String {
    match outbound {
        "direct" => "direct-out".to_string(),
        "reject" => "block-out".to_string(),
        "proxy" => {
            if let Some(node) = outbound_node {
                if all_node_tags.contains(node) {
                    node.clone()
                } else {
                    "direct-out".to_string()
                }
            } else {
                "direct-out".to_string()
            }
        }
        _ => "direct-out".to_string(),
    }
}
```

- [ ] **Step 3: Verify it compiles**

Run: `cd /Users/linqiankai/calamity && cargo check --manifest-path src-tauri/Cargo.toml`
Expected: compiles with no errors

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/singbox/config.rs
git commit -m "feat: generate route rules and rule_set arrays in sing-box config"
```

---

### Task 5: Frontend Service — Replace Mock with Tauri

**Files:**
- Modify: `src/services/rules.ts`

- [ ] **Step 1: Rewrite `rules.ts` with Tauri implementation**

Replace the entire content of `src/services/rules.ts`:

```typescript
import type { RouteRule } from "./types";

export interface RulesService {
  getRules(): Promise<RouteRule[]>;
  addRule(rule: Omit<RouteRule, "id" | "order">): Promise<RouteRule>;
  updateRule(id: string, updates: Partial<RouteRule>): Promise<void>;
  deleteRule(id: string): Promise<void>;
  reorderRules(orderedIds: string[]): Promise<void>;
}

// ---- Mock Implementation ----

let mockRules: RouteRule[] = [
  { id: "r1", name: "Google Services", enabled: true, matchType: "domain-suffix", matchValue: "google.com", outbound: "proxy", outboundNode: "Tokyo 01", order: 0 },
  { id: "r2", name: "GitHub", enabled: true, matchType: "domain-suffix", matchValue: "github.com", outbound: "proxy", outboundNode: "US West", order: 1 },
  { id: "r3", name: "China Direct", enabled: true, matchType: "geosite", matchValue: "cn", outbound: "direct", order: 2, ruleSetUrl: "https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-cn.srs", downloadDetour: "direct" },
  { id: "r4", name: "Ad Block", enabled: true, matchType: "geosite", matchValue: "category-ads-all", outbound: "reject", order: 3, ruleSetUrl: "https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-category-ads-all.srs", downloadDetour: "direct" },
  { id: "r5", name: "Torrent Direct", enabled: true, matchType: "process-name", matchValue: "qbittorrent", outbound: "direct", order: 4 },
  { id: "r6", name: "Streaming", enabled: false, matchType: "geosite", matchValue: "netflix", outbound: "proxy", outboundNode: "SG 01", order: 5 },
];

let nextId = 7;

const mockRulesService: RulesService = {
  async getRules() {
    return mockRules.map((r) => ({ ...r })).sort((a, b) => a.order - b.order);
  },
  async addRule(rule) {
    const newRule: RouteRule = { ...rule, id: `r${nextId++}`, order: mockRules.length };
    if (newRule.matchType === "geosite" && !newRule.ruleSetUrl) {
      newRule.ruleSetUrl = `https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-${newRule.matchValue}.srs`;
    }
    if (newRule.matchType === "geoip" && !newRule.ruleSetUrl) {
      newRule.ruleSetUrl = `https://raw.githubusercontent.com/SagerNet/sing-geoip/rule-set/geoip-${newRule.matchValue}.srs`;
    }
    mockRules.push(newRule);
    return { ...newRule };
  },
  async updateRule(id, updates) {
    mockRules = mockRules.map((r) => (r.id === id ? { ...r, ...updates } : r));
  },
  async deleteRule(id) {
    mockRules = mockRules.filter((r) => r.id !== id);
  },
  async reorderRules(orderedIds) {
    mockRules = orderedIds.map((id, i) => {
      const rule = mockRules.find((r) => r.id === id)!;
      return { ...rule, order: i };
    });
  },
};

// ---- Tauri Implementation ----

interface RawRulesData {
  rules: RouteRule[];
  updateInterval: number;
}

function toRouteRules(raw: RawRulesData): RouteRule[] {
  return raw.rules
    .map((r) => ({ ...r }))
    .sort((a, b) => a.order - b.order);
}

function createTauriRulesService(): RulesService {
  return {
    async getRules() {
      const { invoke } = await import("@tauri-apps/api/core");
      const raw = await invoke<RawRulesData>("get_rules");
      return toRouteRules(raw);
    },
    async addRule(rule) {
      const { invoke } = await import("@tauri-apps/api/core");
      const id = `rule-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const fullRule: RouteRule = { ...rule, id, order: 0 };
      const raw = await invoke<RawRulesData>("add_rule", { rule: fullRule });
      const rules = toRouteRules(raw);
      return rules[rules.length - 1];
    },
    async updateRule(id, updates) {
      const { invoke } = await import("@tauri-apps/api/core");
      // Need to fetch current rule, merge updates, then send full rule
      const raw = await invoke<RawRulesData>("get_rules");
      const current = raw.rules.find((r) => r.id === id);
      if (!current) throw new Error(`Rule ${id} not found`);
      const merged = { ...current, ...updates };
      await invoke("update_rule", { rule: merged });
    },
    async deleteRule(id) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("delete_rule", { id });
    },
    async reorderRules(orderedIds) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("reorder_rules", { orderedIds });
    },
  };
}

// ---- Export ----

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
export const rulesService: RulesService = isTauri ? createTauriRulesService() : mockRulesService;
```

- [ ] **Step 2: Verify frontend compiles**

Run: `cd /Users/linqiankai/calamity && npx tsc --noEmit`
Expected: no type errors

- [ ] **Step 3: Run existing tests**

Run: `cd /Users/linqiankai/calamity && npx vitest run src/services/__tests__/rules.test.ts src/stores/__tests__/rules.test.ts`
Expected: tests pass (they use mock service which still works)

- [ ] **Step 4: Commit**

```bash
git add src/services/rules.ts
git commit -m "feat: add Tauri implementation for rules service alongside mock"
```

---

### Task 6: Update RulesPage — Remove Tailnet, Dynamic Download Detour

**Files:**
- Modify: `src/pages/RulesPage.tsx`

- [ ] **Step 1: Remove tailnet from outbound options and fix download detour selector**

In `src/pages/RulesPage.tsx`:

1. Remove the `tailnet` entry from `outboundColors` and `outboundLabels` (lines 42-54). Change to:

```typescript
const outboundColors: Record<string, string> = {
  proxy: "border-l-primary",
  direct: "border-l-green-500",
  reject: "border-l-red-500",
};

const outboundLabels: Record<string, string> = {
  proxy: "Proxy",
  direct: "DIRECT",
  reject: "REJECT",
};
```

2. In the `<Select>` for outbound (around line 259), remove the tailnet `<SelectItem>`:

Remove:
```tsx
                <SelectItem value="tailnet">Tailnet</SelectItem>
```

3. Remove the tailnet device input block (around line 271):

Remove:
```tsx
            {form.outbound === "tailnet" && (
              <Input placeholder="Tailnet device name" className="bg-muted/30 border-white/[0.06]" value={form.outboundDevice ?? ""} onChange={(e) => setForm({ ...form, outboundDevice: e.target.value })} />
            )}
```

4. In the rule set download detour `<Select>` (around line 283), replace the hardcoded node list with `direct` and `proxy` only (the backend resolves "proxy" to the active proxy node):

Replace the `<SelectContent>` for download detour with:
```tsx
                  <SelectContent className="border-white/[0.06] bg-card/90 backdrop-blur-2xl">
                    <SelectItem value="direct">DIRECT</SelectItem>
                    <SelectItem value="proxy">Proxy</SelectItem>
                  </SelectContent>
```

5. In the `SortableRule` component, remove the `outboundDevice` display (line 94):

Remove:
```tsx
            {rule.outboundDevice && `: ${rule.outboundDevice}`}
```

- [ ] **Step 2: Verify frontend compiles**

Run: `cd /Users/linqiankai/calamity && npx tsc --noEmit`
Expected: no type errors

- [ ] **Step 3: Commit**

```bash
git add src/pages/RulesPage.tsx
git commit -m "feat: remove tailnet from rules UI, simplify download detour options"
```

---

### Task 7: Add Local Rule Set Path Support to UI

**Files:**
- Modify: `src/pages/RulesPage.tsx`
- Modify: `src/services/types.ts`

- [ ] **Step 1: Add `ruleSetLocalPath` to RouteRule type**

In `src/services/types.ts`, add `ruleSetLocalPath` to the `RouteRule` interface:

```typescript
export interface RouteRule {
  id: string;
  name: string;
  enabled: boolean;
  matchType: "domain-suffix" | "domain-keyword" | "domain-full" | "domain-regex" | "geosite" | "geoip" | "ip-cidr" | "process-name" | "process-path" | "process-path-regex" | "port" | "port-range" | "network";
  // For geosite/geoip rule sets
  ruleSetUrl?: string;
  ruleSetLocalPath?: string;
  downloadDetour?: string;
  matchValue: string;
  outbound: OutboundType;
  outboundNode?: string;
  outboundDevice?: string;
  order: number;
}
```

- [ ] **Step 2: Add local path input in rule set section of RulesPage.tsx**

In the rule set download section (the block inside `{(form.matchType === "geosite" || form.matchType === "geoip") && (...)}`), add a local path input after the URL input:

```tsx
                <Input
                  placeholder="Local .srs file path (optional, overrides URL)"
                  className="bg-muted/30 border-white/[0.06] text-xs font-mono"
                  value={(form as any).ruleSetLocalPath ?? ""}
                  onChange={(e) => setForm({ ...form, ruleSetLocalPath: e.target.value } as any)}
                />
```

Also update the `RuleFormData` type and `defaultForm` to include `ruleSetLocalPath`:

In the `defaultForm` object, add:
```typescript
  ruleSetLocalPath: "",
```

And in `openEdit`, add to the form population:
```typescript
      ruleSetLocalPath: rule.ruleSetLocalPath,
```

- [ ] **Step 3: Verify frontend compiles**

Run: `cd /Users/linqiankai/calamity && npx tsc --noEmit`
Expected: no type errors

- [ ] **Step 4: Commit**

```bash
git add src/services/types.ts src/pages/RulesPage.tsx
git commit -m "feat: add local rule set path support in rules UI"
```

---

### Task 8: Update Frontend Tests

**Files:**
- Modify: `src/services/__tests__/rules.test.ts`
- Modify: `src/services/__tests__/rules-ruleset.test.ts`
- Modify: `src/stores/__tests__/rules.test.ts`

- [ ] **Step 1: Update service tests for updated mock data**

The mock data changed (removed tailnet rule, renumbered). Update `src/services/__tests__/rules.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { rulesService } from "../rules";

describe("rulesService", () => {
  it("getRules returns sorted rules", async () => {
    const rules = await rulesService.getRules();
    expect(rules.length).toBeGreaterThan(0);
    for (let i = 1; i < rules.length; i++) {
      expect(rules[i].order).toBeGreaterThanOrEqual(rules[i - 1].order);
    }
  });

  it("addRule creates a new rule with generated id", async () => {
    const before = await rulesService.getRules();
    const newRule = await rulesService.addRule({
      name: "Test Rule",
      enabled: true,
      matchType: "domain-suffix",
      matchValue: "test.com",
      outbound: "direct",
    });
    expect(newRule.id).toBeTruthy();
    expect(newRule.name).toBe("Test Rule");

    const after = await rulesService.getRules();
    expect(after.length).toBe(before.length + 1);
  });

  it("updateRule modifies an existing rule", async () => {
    const rules = await rulesService.getRules();
    const target = rules[0];
    await rulesService.updateRule(target.id, { name: "Updated Name" });

    const updated = await rulesService.getRules();
    const found = updated.find((r) => r.id === target.id)!;
    expect(found.name).toBe("Updated Name");
  });

  it("deleteRule removes a rule", async () => {
    const rules = await rulesService.getRules();
    const target = rules[rules.length - 1];
    await rulesService.deleteRule(target.id);

    const after = await rulesService.getRules();
    expect(after.find((r) => r.id === target.id)).toBeUndefined();
  });

  it("reorderRules changes order", async () => {
    const rules = await rulesService.getRules();
    const ids = rules.map((r) => r.id);
    const reversed = [...ids].reverse();
    await rulesService.reorderRules(reversed);

    const reordered = await rulesService.getRules();
    expect(reordered[0].id).toBe(reversed[0]);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `cd /Users/linqiankai/calamity && npx vitest run src/services/__tests__/rules.test.ts src/services/__tests__/rules-ruleset.test.ts src/stores/__tests__/rules.test.ts`
Expected: all tests pass

- [ ] **Step 3: Commit**

```bash
git add src/services/__tests__/rules.test.ts src/services/__tests__/rules-ruleset.test.ts src/stores/__tests__/rules.test.ts
git commit -m "test: update rules tests for new mock data"
```

---

### Task 9: Integration Test — Build and Verify Config

**Files:**
- No new files; manual verification

- [ ] **Step 1: Build the full project**

Run: `cd /Users/linqiankai/calamity && cargo build --manifest-path src-tauri/Cargo.toml`
Expected: compiles successfully

- [ ] **Step 2: Run all frontend tests**

Run: `cd /Users/linqiankai/calamity && npx vitest run`
Expected: all tests pass

- [ ] **Step 3: Start the app and verify**

Run: `cd /Users/linqiankai/calamity && npx tauri dev`

Verification steps:
1. Open Rules page from sidebar
2. Add a new rule (e.g., domain-suffix `youtube.com` -> proxy)
3. Check that `~/Library/Application Support/com.calamity.app/rules.json` was created with the rule
4. Check that `~/Library/Application Support/com.calamity.app/singbox-config.json` contains the rule in `route.rules`
5. Add a geosite rule and verify `route.rule_set` is generated in the config
6. Delete a rule and verify it's removed from both files
7. Reorder rules via drag-and-drop and verify order is persisted

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: integration fixes for route rules"
```
