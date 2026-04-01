# Rule Set Market Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Rule Set Market" page that lets users search, browse, and one-click install rule sets from the Kotodian/singbox_ruleset GitHub repository.

**Architecture:** Rust backend fetches the GitHub repo's directory listing via API, caches it locally as JSON. Frontend displays a searchable list. Selecting a rule set opens a dialog to pick outbound, then creates a rule via existing `addRule` flow. A new `rule-set` matchType is added so config generation produces the correct sing-box `rule_set` references.

**Tech Stack:** Rust (reqwest for GitHub API), React + TypeScript (frontend page), existing Tauri command pattern, existing rules store.

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src-tauri/src/singbox/ruleset_market.rs` | Create | Fetch GitHub API, cache rule set list, load from cache |
| `src-tauri/src/commands/ruleset_market.rs` | Create | Tauri commands: `get_ruleset_list` |
| `src-tauri/src/commands/mod.rs` | Modify | Register new module |
| `src-tauri/src/singbox/mod.rs` | Modify | Register new module |
| `src-tauri/src/lib.rs` | Modify | Register new command |
| `src-tauri/src/singbox/config.rs` | Modify | Handle `rule-set` matchType in `build_route_rules` |
| `src/services/types.ts` | Modify | Add `rule-set` to `matchType` union, add `RuleSetEntry` type |
| `src/services/ruleset-market.ts` | Create | Service layer for fetching rule set list |
| `src/stores/ruleset-market.ts` | Create | Zustand store for rule set list + search |
| `src/pages/RuleSetMarketPage.tsx` | Create | Market page UI |
| `src/App.tsx` | Modify | Add route |
| `src/components/Sidebar.tsx` | Modify | Add nav item |
| `src/i18n/resources.ts` | Modify | Add i18n strings |
| `src/pages/RulesPage.tsx` | Modify | Add `rule-set` to matchType dropdown |

---

### Task 1: Backend — Rule Set List Fetch & Cache

**Files:**
- Create: `src-tauri/src/singbox/ruleset_market.rs`
- Modify: `src-tauri/src/singbox/mod.rs`

- [ ] **Step 1: Create `ruleset_market.rs` with types and cache logic**

```rust
// src-tauri/src/singbox/ruleset_market.rs
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

use super::storage;

const CACHE_FILE: &str = "ruleset_market_cache.json";
const CACHE_TTL_SECS: u64 = 86400; // 24 hours
const GITHUB_API_URL: &str =
    "https://api.github.com/repos/Kotodian/singbox_ruleset/contents/rule";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuleSetEntry {
    pub name: String,
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct CachedRuleSetList {
    pub entries: Vec<RuleSetEntry>,
    pub fetched_at: u64, // unix timestamp
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn load_cache() -> Option<CachedRuleSetList> {
    let cached: CachedRuleSetList = storage::read_json(CACHE_FILE);
    if cached.entries.is_empty() {
        return None;
    }
    if now_secs() - cached.fetched_at > CACHE_TTL_SECS {
        return None;
    }
    Some(cached)
}

fn save_cache(entries: &[RuleSetEntry]) -> Result<(), String> {
    let cached = CachedRuleSetList {
        entries: entries.to_vec(),
        fetched_at: now_secs(),
    };
    storage::write_json(CACHE_FILE, &cached)
}

#[derive(Deserialize)]
struct GithubDirEntry {
    name: String,
    #[serde(rename = "type")]
    entry_type: String,
}

pub async fn get_ruleset_list() -> Result<Vec<RuleSetEntry>, String> {
    // Return cache if fresh
    if let Some(cached) = load_cache() {
        return Ok(cached.entries);
    }

    // Fetch from GitHub API
    let client = reqwest::Client::new();
    let resp = client
        .get(GITHUB_API_URL)
        .header("User-Agent", "Calamity")
        .header("Accept", "application/vnd.github.v3+json")
        .send()
        .await
        .map_err(|e| format!("GitHub API request failed: {}", e))?;

    if !resp.status().is_success() {
        // If API fails but we have stale cache, use it
        let stale: CachedRuleSetList = storage::read_json(CACHE_FILE);
        if !stale.entries.is_empty() {
            return Ok(stale.entries);
        }
        return Err(format!("GitHub API returned {}", resp.status()));
    }

    let dirs: Vec<GithubDirEntry> = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse GitHub response: {}", e))?;

    let entries: Vec<RuleSetEntry> = dirs
        .into_iter()
        .filter(|d| d.entry_type == "dir")
        .map(|d| {
            let url = format!(
                "https://raw.githubusercontent.com/Kotodian/singbox_ruleset/main/rule/{}/{}.srs",
                d.name, d.name
            );
            RuleSetEntry {
                name: d.name,
                url,
            }
        })
        .collect();

    let _ = save_cache(&entries);
    Ok(entries)
}
```

- [ ] **Step 2: Register module in `src-tauri/src/singbox/mod.rs`**

Add this line alongside the other `pub mod` declarations:

```rust
pub mod ruleset_market;
```

- [ ] **Step 3: Verify it compiles**

Run: `cargo check --manifest-path src-tauri/Cargo.toml`
Expected: Compiles with no new errors.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/singbox/ruleset_market.rs src-tauri/src/singbox/mod.rs
git commit -m "feat(ruleset-market): add backend fetch + cache for rule set list"
```

---

### Task 2: Backend — Tauri Command

**Files:**
- Create: `src-tauri/src/commands/ruleset_market.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Create command file**

```rust
// src-tauri/src/commands/ruleset_market.rs
use crate::singbox::ruleset_market::{self, RuleSetEntry};

#[tauri::command]
pub async fn get_ruleset_list() -> Result<Vec<RuleSetEntry>, String> {
    ruleset_market::get_ruleset_list().await
}
```

- [ ] **Step 2: Register module in `src-tauri/src/commands/mod.rs`**

Add:

```rust
pub mod ruleset_market;
```

- [ ] **Step 3: Register command in `src-tauri/src/lib.rs`**

In the `generate_handler!` macro, add after the `commands::rules::update_final_outbound` line:

```rust
            commands::ruleset_market::get_ruleset_list,
```

- [ ] **Step 4: Verify it compiles**

Run: `cargo check --manifest-path src-tauri/Cargo.toml`
Expected: Compiles with no new errors.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/ruleset_market.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs
git commit -m "feat(ruleset-market): add Tauri command for rule set list"
```

---

### Task 3: Backend — Handle `rule-set` matchType in Config Generation

**Files:**
- Modify: `src-tauri/src/singbox/config.rs:313-375`

The existing `build_route_rules` handles `geosite`/`geoip` (which auto-generate URLs) and direct match types. The new `rule-set` type uses a user-provided URL directly with no auto-generation.

- [ ] **Step 1: Add `rule-set` arm to the match in `build_route_rules`**

In `config.rs`, the match on `rule.match_type.as_str()` currently has `"geosite" | "geoip" => { ... }` and `_ => { ... }`. Add a new arm between them:

```rust
            "rule-set" => {
                // rule-set: matchValue is the tag, ruleSetUrl is the .srs URL
                let rule_set_tag = format!("ruleset-{}", rule.match_value);

                let mut route_rule = json!({
                    "rule_set": rule_set_tag,
                    "action": "route",
                    "outbound": outbound_tag
                });
                if rule.invert {
                    route_rule["invert"] = json!(true);
                }
                route_rules.push(route_rule);

                if !seen_rule_sets.contains(&rule_set_tag) {
                    seen_rule_sets.insert(rule_set_tag.clone());

                    let url = rule.rule_set_url.clone().unwrap_or_default();
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
                            "proxy" => all_node_tags
                                .first()
                                .cloned()
                                .unwrap_or_else(|| "direct-out".to_string()),
                            other => other.to_string(),
                        };
                        rs["download_detour"] = json!(detour_tag);
                    }

                    rule_sets.push(rs);
                }
            }
```

- [ ] **Step 2: Verify it compiles**

Run: `cargo check --manifest-path src-tauri/Cargo.toml`
Expected: Compiles with no new errors.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/singbox/config.rs
git commit -m "feat(ruleset-market): handle rule-set matchType in config generation"
```

---

### Task 4: Frontend — Types and Service Layer

**Files:**
- Modify: `src/services/types.ts:164`
- Create: `src/services/ruleset-market.ts`

- [ ] **Step 1: Add `rule-set` to `RouteRule.matchType` union in `types.ts`**

Change the `matchType` line:

```typescript
  matchType: "domain-suffix" | "domain-keyword" | "domain-full" | "domain-regex" | "geosite" | "geoip" | "ip-cidr" | "process-name" | "process-path" | "process-path-regex" | "port" | "port-range" | "network" | "rule-set";
```

- [ ] **Step 2: Create `src/services/ruleset-market.ts`**

```typescript
// src/services/ruleset-market.ts

export interface RuleSetEntry {
  name: string;
  url: string;
}

export interface RuleSetMarketService {
  getList(): Promise<RuleSetEntry[]>;
}

const mockEntries: RuleSetEntry[] = [
  { name: "Google", url: "https://raw.githubusercontent.com/Kotodian/singbox_ruleset/main/rule/Google/Google.srs" },
  { name: "YouTube", url: "https://raw.githubusercontent.com/Kotodian/singbox_ruleset/main/rule/YouTube/YouTube.srs" },
  { name: "Netflix", url: "https://raw.githubusercontent.com/Kotodian/singbox_ruleset/main/rule/Netflix/Netflix.srs" },
  { name: "Telegram", url: "https://raw.githubusercontent.com/Kotodian/singbox_ruleset/main/rule/Telegram/Telegram.srs" },
  { name: "Advertising", url: "https://raw.githubusercontent.com/Kotodian/singbox_ruleset/main/rule/Advertising/Advertising.srs" },
  { name: "China", url: "https://raw.githubusercontent.com/Kotodian/singbox_ruleset/main/rule/China/China.srs" },
  { name: "ChinaMax", url: "https://raw.githubusercontent.com/Kotodian/singbox_ruleset/main/rule/ChinaMax/ChinaMax.srs" },
];

const mockService: RuleSetMarketService = {
  async getList() {
    return mockEntries;
  },
};

function createTauriService(): RuleSetMarketService {
  return {
    async getList() {
      const { invoke } = await import("@tauri-apps/api/core");
      return invoke<RuleSetEntry[]>("get_ruleset_list");
    },
  };
}

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
export const ruleSetMarketService: RuleSetMarketService = isTauri
  ? createTauriService()
  : mockService;
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | grep -v tailnet.ts`
Expected: No new errors.

- [ ] **Step 4: Commit**

```bash
git add src/services/types.ts src/services/ruleset-market.ts
git commit -m "feat(ruleset-market): add types and service layer"
```

---

### Task 5: Frontend — Zustand Store

**Files:**
- Create: `src/stores/ruleset-market.ts`

- [ ] **Step 1: Create the store**

```typescript
// src/stores/ruleset-market.ts
import { create } from "zustand";
import { ruleSetMarketService, type RuleSetEntry } from "../services/ruleset-market";

interface RuleSetMarketStore {
  entries: RuleSetEntry[];
  loading: boolean;
  error: string | null;
  search: string;
  setSearch: (search: string) => void;
  fetchList: () => Promise<void>;
  filtered: () => RuleSetEntry[];
}

export const useRuleSetMarketStore = create<RuleSetMarketStore>((set, get) => ({
  entries: [],
  loading: false,
  error: null,
  search: "",

  setSearch(search) {
    set({ search });
  },

  async fetchList() {
    set({ loading: true, error: null });
    try {
      const entries = await ruleSetMarketService.getList();
      set({ entries });
    } catch (e) {
      set({ error: String(e) });
    } finally {
      set({ loading: false });
    }
  },

  filtered() {
    const { entries, search } = get();
    if (!search.trim()) return entries;
    const q = search.toLowerCase();
    return entries.filter((e) => e.name.toLowerCase().includes(q));
  },
}));
```

- [ ] **Step 2: Commit**

```bash
git add src/stores/ruleset-market.ts
git commit -m "feat(ruleset-market): add Zustand store with search"
```

---

### Task 6: Frontend — Market Page UI

**Files:**
- Create: `src/pages/RuleSetMarketPage.tsx`

- [ ] **Step 1: Create the page**

```tsx
// src/pages/RuleSetMarketPage.tsx
import { useEffect, useState } from "react";
import { Search, Plus, Loader2, Download } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useTranslation } from "react-i18next";
import { useRuleSetMarketStore } from "@/stores/ruleset-market";
import { useRulesStore } from "@/stores/rules";
import { useNodesStore } from "@/stores/nodes";
import type { OutboundType } from "@/services/types";
import { toast } from "sonner";

export function RuleSetMarketPage() {
  const { t } = useTranslation();
  const { entries, loading, error, search, setSearch, fetchList, filtered } =
    useRuleSetMarketStore();
  const { addRule } = useRulesStore();
  const { groups, fetchGroups } = useNodesStore();
  const allNodes = groups.flatMap((g) => g.nodes);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<{ name: string; url: string } | null>(null);
  const [outbound, setOutbound] = useState<OutboundType>("proxy");
  const [outboundNode, setOutboundNode] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    fetchList();
    fetchGroups();
  }, [fetchList, fetchGroups]);

  function openAddDialog(entry: { name: string; url: string }) {
    setSelectedEntry(entry);
    setOutbound("proxy");
    setOutboundNode("");
    setDialogOpen(true);
  }

  async function handleAdd() {
    if (!selectedEntry) return;
    setAdding(true);
    try {
      await addRule({
        name: selectedEntry.name,
        enabled: true,
        matchType: "rule-set",
        matchValue: selectedEntry.name,
        outbound,
        outboundNode: outbound === "proxy" && outboundNode ? outboundNode : undefined,
        ruleSetUrl: selectedEntry.url,
        downloadDetour: "direct",
      });
      toast.success(t("ruleSetMarket.added", { name: selectedEntry.name }));
      setDialogOpen(false);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setAdding(false);
    }
  }

  const list = filtered();

  return (
    <div className="p-6 space-y-6">
      <div className="animate-slide-up">
        <h1 className="text-2xl font-semibold">{t("ruleSetMarket.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("ruleSetMarket.subtitle", { count: entries.length })}
        </p>
      </div>

      <div className="relative animate-slide-up">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={t("ruleSetMarket.searchPlaceholder")}
          className="pl-9 bg-muted/30 border-white/[0.06]"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {error && (
        <div className="text-sm text-red-400 text-center py-4">{error}</div>
      )}

      {!loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {list.map((entry) => (
            <Card
              key={entry.name}
              className="rounded-xl border border-white/[0.06] bg-card/40 backdrop-blur-xl transition-all duration-200 hover:border-white/10 hover:bg-card/80"
            >
              <CardContent className="flex items-center justify-between p-3">
                <span className="text-sm font-medium truncate">{entry.name}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 hover:bg-white/[0.04]"
                  onClick={() => openAddDialog(entry)}
                >
                  <Download className="h-3.5 w-3.5" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!loading && !error && list.length === 0 && search && (
        <p className="text-sm text-muted-foreground text-center py-8">
          {t("ruleSetMarket.noResults")}
        </p>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="rounded-xl border border-white/[0.06] bg-card/80 backdrop-blur-2xl shadow-[0_0_40px_rgba(0,0,0,0.3)]">
          <DialogHeader>
            <DialogTitle>
              {t("ruleSetMarket.addTitle", { name: selectedEntry?.name })}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Select value={outbound} onValueChange={(v) => setOutbound(v as OutboundType)}>
              <SelectTrigger className="bg-muted/30 border-white/[0.06]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-white/[0.06] bg-card/90 backdrop-blur-2xl">
                <SelectItem value="proxy">{t("common.outbound.proxy")}</SelectItem>
                <SelectItem value="direct">{t("common.outbound.direct")}</SelectItem>
                <SelectItem value="reject">{t("common.outbound.reject")}</SelectItem>
                <SelectItem value="tailnet">{t("common.outbound.tailnet")}</SelectItem>
              </SelectContent>
            </Select>
            {outbound === "proxy" && (
              <Select value={outboundNode || undefined} onValueChange={setOutboundNode}>
                <SelectTrigger className="bg-muted/30 border-white/[0.06]">
                  <SelectValue placeholder={t("rules.selectNode")} />
                </SelectTrigger>
                <SelectContent className="border-white/[0.06] bg-card/90 backdrop-blur-2xl">
                  {allNodes.map((node) => (
                    <SelectItem key={node.id} value={node.name}>
                      {node.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="border-white/[0.06] hover:bg-white/[0.04]"
              onClick={() => setDialogOpen(false)}
              disabled={adding}
            >
              {t("common.actions.cancel")}
            </Button>
            <Button
              onClick={handleAdd}
              disabled={adding}
              className="shadow-[0_0_15px_rgba(254,151,185,0.15)]"
            >
              {adding ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
              {t("ruleSetMarket.add")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/RuleSetMarketPage.tsx
git commit -m "feat(ruleset-market): add market page UI with search and add dialog"
```

---

### Task 7: Frontend — Wire Up Route, Sidebar, and i18n

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/Sidebar.tsx`
- Modify: `src/i18n/resources.ts`
- Modify: `src/pages/RulesPage.tsx`

- [ ] **Step 1: Add route in `App.tsx`**

Add import at top:

```typescript
import { RuleSetMarketPage } from "./pages/RuleSetMarketPage";
```

Add route after the `rules` route:

```tsx
          <Route path="ruleset-market" element={<RuleSetMarketPage />} />
```

- [ ] **Step 2: Add sidebar nav item in `Sidebar.tsx`**

Add `PackageSearch` to the lucide-react import:

```typescript
import {
  LayoutDashboard,
  Globe,
  Route,
  ScrollText,
  Network,
  Shell,
  Settings,
  Cable,
  Rss,
  PanelLeftClose,
  PanelLeftOpen,
  PackageSearch,
} from "lucide-react";
```

Add after the rules nav item in the `navItems` array:

```typescript
    { to: "/ruleset-market", icon: PackageSearch, label: t("sidebar.ruleSetMarket") },
```

- [ ] **Step 3: Add `rule-set` to matchType dropdown in `RulesPage.tsx`**

In the matchType `<Select>` inside the dialog, add after the `network` option:

```tsx
                <SelectItem value="rule-set">rule-set</SelectItem>
```

- [ ] **Step 4: Add i18n strings in `resources.ts`**

In the English `translation` object, add after the `rules` section:

```typescript
      ruleSetMarket: {
        title: "Rule Sets",
        subtitle: "{{count}} rule sets available",
        searchPlaceholder: "Search rule sets...",
        noResults: "No matching rule sets",
        addTitle: "Add {{name}}",
        add: "Add Rule",
        added: "{{name}} added",
      },
```

In the `sidebar` section (English), add:

```typescript
        ruleSetMarket: "Rule Sets",
```

In the Chinese `translation` object, add after the `rules` section:

```typescript
      ruleSetMarket: {
        title: "规则集",
        subtitle: "{{count}} 个规则集可用",
        searchPlaceholder: "搜索规则集...",
        noResults: "没有匹配的规则集",
        addTitle: "添加 {{name}}",
        add: "添加规则",
        added: "{{name}} 已添加",
      },
```

In the `sidebar` section (Chinese), add:

```typescript
        ruleSetMarket: "规则集",
```

- [ ] **Step 5: Verify frontend compiles and tests pass**

Run: `npx vitest run`
Expected: All existing tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/components/Sidebar.tsx src/i18n/resources.ts src/pages/RulesPage.tsx
git commit -m "feat(ruleset-market): wire up route, sidebar, i18n, and rule-set matchType"
```
