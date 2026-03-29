# Dashboard Real Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all mock data on the Dashboard with real sing-box Clash API data, streamed through the Tauri backend.

**Architecture:** The Tauri backend subscribes to sing-box's Clash API streaming endpoints (`/traffic`, `/connections`, `/memory`) and pushes data to the frontend via Tauri events. The frontend connection store maintains a rolling 5-minute speed history (300 points at 1/sec). The power button toggles proxy by setting/clearing the active node.

**Tech Stack:** Rust/Tauri backend, sing-box Clash API, Zustand stores, React/Recharts frontend

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `src-tauri/src/singbox/clash_api.rs` | Add `traffic_stream()`, `get_connections()`, `get_memory()` |
| Create | `src-tauri/src/commands/traffic.rs` | Tauri commands: `subscribe_traffic`, `get_dashboard_info` |
| Modify | `src-tauri/src/commands/mod.rs` | Register traffic module |
| Modify | `src-tauri/src/lib.rs` | Register new commands in invoke_handler |
| Rewrite | `src/services/connection.ts` | Replace mock with Tauri invokes |
| Rewrite | `src/stores/connection.ts` | Real data, local speed history, event subscriptions |
| Modify | `src/pages/DashboardPage.tsx` | Add stat cards (connections, memory, uptime), wire real data |

---

### Task 1: Add Clash API methods for traffic, connections, memory

**Files:**
- Modify: `src-tauri/src/singbox/clash_api.rs`

- [ ] **Step 1: Add `traffic_stream` method to ClashApi**

```rust
// Add to clash_api.rs, inside impl ClashApi block, after logs_stream method:

    /// GET /traffic — streaming endpoint, returns {"up": bytes_per_sec, "down": bytes_per_sec} per line
    pub async fn traffic_stream(&self) -> Result<reqwest::Response, String> {
        self.client
            .get(format!("{}/traffic", BASE_URL))
            .send()
            .await
            .map_err(|e| e.to_string())
    }

    /// GET /connections — returns snapshot of all connections + totals
    pub async fn get_connections(&self) -> Result<Value, String> {
        self.client
            .get(format!("{}/connections", BASE_URL))
            .send()
            .await
            .map_err(|e| e.to_string())?
            .json()
            .await
            .map_err(|e| e.to_string())
    }

    /// GET /memory — returns {"inuse": bytes, "oslimit": bytes}
    pub async fn get_memory(&self) -> Result<Value, String> {
        self.client
            .get(format!("{}/memory", BASE_URL))
            .send()
            .await
            .map_err(|e| e.to_string())?
            .json()
            .await
            .map_err(|e| e.to_string())
    }
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /Users/linqiankai/calamity/src-tauri && cargo check 2>&1 | tail -5`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/singbox/clash_api.rs
git commit -m "feat: add traffic, connections, memory methods to ClashApi"
```

---

### Task 2: Create traffic Tauri commands

**Files:**
- Create: `src-tauri/src/commands/traffic.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Create `src-tauri/src/commands/traffic.rs`**

```rust
use std::sync::Arc;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

use crate::singbox::process::SingboxProcess;

#[derive(Clone, Serialize)]
pub struct TrafficEvent {
    pub up: u64,
    pub down: u64,
}

#[derive(Clone, Serialize)]
pub struct DashboardInfo {
    pub running: bool,
    pub version: String,
    pub uptime: u64, // seconds since subscribe_traffic started
    pub active_connections: usize,
    pub upload_total: u64,
    pub download_total: u64,
    pub memory_inuse: u64,
}

/// Subscribe to real-time traffic data. Emits "traffic-update" events every ~1 second.
#[tauri::command]
pub async fn subscribe_traffic(app: AppHandle) -> Result<(), String> {
    let process = app.state::<Arc<SingboxProcess>>().inner().clone();

    let response = process.api().traffic_stream().await?;

    tokio::spawn(async move {
        let mut response = response;
        let mut buffer = String::new();

        loop {
            match response.chunk().await {
                Ok(Some(chunk)) => {
                    let text = String::from_utf8_lossy(&chunk);
                    buffer.push_str(&text);

                    while let Some(newline_pos) = buffer.find('\n') {
                        let line = buffer[..newline_pos].trim().to_string();
                        buffer = buffer[newline_pos + 1..].to_string();

                        if line.is_empty() {
                            continue;
                        }

                        if let Ok(val) = serde_json::from_str::<serde_json::Value>(&line) {
                            let up = val.get("up").and_then(|v| v.as_u64()).unwrap_or(0);
                            let down = val.get("down").and_then(|v| v.as_u64()).unwrap_or(0);
                            let _ = app.emit("traffic-update", TrafficEvent { up, down });
                        }
                    }
                }
                Ok(None) => break,
                Err(_) => break,
            }
        }
    });

    Ok(())
}

/// Get a snapshot of dashboard-relevant info in one call.
#[tauri::command]
pub async fn get_dashboard_info(app: AppHandle) -> Result<DashboardInfo, String> {
    let process = app.state::<Arc<SingboxProcess>>().inner().clone();
    let running = process.is_running().await;

    if !running {
        return Ok(DashboardInfo {
            running: false,
            version: "not running".to_string(),
            uptime: 0,
            active_connections: 0,
            upload_total: 0,
            download_total: 0,
            memory_inuse: 0,
        });
    }

    let version = process.api().version().await
        .map(|v| v.version)
        .unwrap_or_else(|_| "unknown".to_string());

    let (active_connections, upload_total, download_total) =
        match process.api().get_connections().await {
            Ok(val) => {
                let conns = val.get("connections")
                    .and_then(|c| c.as_array())
                    .map(|a| a.len())
                    .unwrap_or(0);
                let up = val.get("uploadTotal").and_then(|v| v.as_u64()).unwrap_or(0);
                let down = val.get("downloadTotal").and_then(|v| v.as_u64()).unwrap_or(0);
                (conns, up, down)
            }
            Err(_) => (0, 0, 0),
        };

    let memory_inuse = match process.api().get_memory().await {
        Ok(val) => val.get("inuse").and_then(|v| v.as_u64()).unwrap_or(0),
        Err(_) => 0,
    };

    Ok(DashboardInfo {
        running,
        version,
        uptime: 0, // will be tracked client-side
        active_connections,
        upload_total,
        download_total,
        memory_inuse,
    })
}
```

- [ ] **Step 2: Register traffic module in `src-tauri/src/commands/mod.rs`**

Add this line:
```rust
pub mod traffic;
```

- [ ] **Step 3: Register commands in `src-tauri/src/lib.rs` invoke_handler**

Add to the `tauri::generate_handler![]` macro:
```rust
commands::traffic::subscribe_traffic,
commands::traffic::get_dashboard_info,
```

- [ ] **Step 4: Verify it compiles**

Run: `cd /Users/linqiankai/calamity/src-tauri && cargo check 2>&1 | tail -5`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/traffic.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs
git commit -m "feat: add subscribe_traffic and get_dashboard_info Tauri commands"
```

---

### Task 3: Rewrite connection service to use real Tauri backend

**Files:**
- Rewrite: `src/services/connection.ts`

- [ ] **Step 1: Replace mock connection service with Tauri implementation**

```typescript
import type { ConnectionState, ProxyMode, SpeedRecord } from "./types";

export interface ConnectionService {
  getState(): Promise<ConnectionState>;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  setMode(mode: ProxyMode): Promise<void>;
  subscribeTrafic(onUpdate: (up: number, down: number) => void): () => void;
  getDashboardInfo(): Promise<DashboardInfo>;
}

export interface DashboardInfo {
  running: boolean;
  version: string;
  uptime: number;
  activeConnections: number;
  uploadTotal: number;
  downloadTotal: number;
  memoryInuse: number;
}

function createTauriConnectionService(): ConnectionService {
  return {
    async getState() {
      const { invoke } = await import("@tauri-apps/api/core");
      const status = await invoke<{ running: boolean; version: string }>("singbox_status");

      // Check if there's an active node
      const nodesData = await invoke<{ activeNode: string | null }>("get_nodes");
      const isConnected = status.running && !!nodesData.activeNode;

      return {
        status: isConnected ? "connected" : "disconnected",
        mode: "rule" as ProxyMode,
        activeNode: nodesData.activeNode,
        uploadSpeed: 0,
        downloadSpeed: 0,
        totalUpload: 0,
        totalDownload: 0,
        latency: 0,
      };
    },

    async connect() {
      // connect = ensure sing-box is running. Active node is set via NodesStore.
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("singbox_start");
    },

    async disconnect() {
      // disconnect = clear active node (sing-box keeps running for direct traffic)
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("disconnect_node");
    },

    async setMode(_mode: ProxyMode) {
      // Mode switching not yet implemented in backend
    },

    subscribeTrafic(onUpdate) {
      let unlisten: (() => void) | null = null;
      let cancelled = false;

      (async () => {
        try {
          const { invoke } = await import("@tauri-apps/api/core");
          const { listen } = await import("@tauri-apps/api/event");

          // Start listening before subscribing to avoid missing events
          unlisten = await listen<{ up: number; down: number }>("traffic-update", (event) => {
            if (!cancelled) {
              onUpdate(event.payload.up, event.payload.down);
            }
          });

          await invoke("subscribe_traffic");
        } catch (e) {
          console.error("[traffic] subscribe failed:", e);
        }
      })();

      return () => {
        cancelled = true;
        if (unlisten) unlisten();
      };
    },

    async getDashboardInfo() {
      const { invoke } = await import("@tauri-apps/api/core");
      return invoke<DashboardInfo>("get_dashboard_info");
    },
  };
}

function createMockConnectionService(): ConnectionService {
  return {
    async getState() {
      return {
        status: "disconnected" as const,
        mode: "rule" as ProxyMode,
        activeNode: null,
        uploadSpeed: 0,
        downloadSpeed: 0,
        totalUpload: 0,
        totalDownload: 0,
        latency: 0,
      };
    },
    async connect() {},
    async disconnect() {},
    async setMode() {},
    subscribeTrafic() { return () => {}; },
    async getDashboardInfo() {
      return { running: false, version: "mock", uptime: 0, activeConnections: 0, uploadTotal: 0, downloadTotal: 0, memoryInuse: 0 };
    },
  };
}

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
export const connectionService: ConnectionService = isTauri
  ? createTauriConnectionService()
  : createMockConnectionService();
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/linqiankai/calamity && npx tsc --noEmit 2>&1 | head -20`
Expected: no errors (or only pre-existing ones)

- [ ] **Step 3: Commit**

```bash
git add src/services/connection.ts
git commit -m "feat: replace mock connection service with real Tauri implementation"
```

---

### Task 4: Rewrite connection store with real data and speed history

**Files:**
- Rewrite: `src/stores/connection.ts`

- [ ] **Step 1: Rewrite connection store**

```typescript
import { create } from "zustand";
import { connectionService, type DashboardInfo } from "../services/connection";
import type { ConnectionState, ProxyMode, SpeedRecord } from "../services/types";

const MAX_HISTORY = 300; // 5 minutes at 1 point/sec

interface ConnectionStore extends ConnectionState {
  speedHistory: SpeedRecord[];
  activeConnections: number;
  memoryInuse: number;
  version: string;
  startedAt: number | null; // timestamp when traffic subscription started

  fetchState: () => Promise<void>;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  toggleConnection: () => Promise<void>;
  setMode: (mode: ProxyMode) => Promise<void>;
  subscribeTraffic: () => () => void;
  fetchDashboardInfo: () => Promise<void>;
}

function timeLabel(): string {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export const useConnectionStore = create<ConnectionStore>((set, get) => ({
  status: "disconnected",
  mode: "rule",
  activeNode: null,
  uploadSpeed: 0,
  downloadSpeed: 0,
  totalUpload: 0,
  totalDownload: 0,
  latency: 0,
  speedHistory: [],
  activeConnections: 0,
  memoryInuse: 0,
  version: "",
  startedAt: null,

  async fetchState() {
    const state = await connectionService.getState();
    set({
      status: state.status,
      activeNode: state.activeNode,
    });
  },

  async connect() {
    set({ status: "connecting" });
    try {
      await connectionService.connect();
      // Re-fetch state after ensuring sing-box is running
      await get().fetchState();
    } catch {
      set({ status: "disconnected" });
    }
  },

  async disconnect() {
    await connectionService.disconnect();
    set({
      status: "disconnected",
      activeNode: null,
      uploadSpeed: 0,
      downloadSpeed: 0,
    });
  },

  async toggleConnection() {
    if (get().status === "connected") {
      await get().disconnect();
    } else {
      await get().connect();
    }
  },

  async setMode(mode) {
    await connectionService.setMode(mode);
    set({ mode });
  },

  subscribeTraffic() {
    set({ startedAt: Date.now() });

    const unsub = connectionService.subscribeTrafic((up, down) => {
      set((state) => {
        const record: SpeedRecord = {
          time: timeLabel(),
          upload: up,
          download: down,
        };
        const history = [...state.speedHistory, record].slice(-MAX_HISTORY);
        return {
          uploadSpeed: up,
          downloadSpeed: down,
          speedHistory: history,
        };
      });
    });

    // Poll dashboard info every 2 seconds for totals, connections, memory
    const interval = setInterval(async () => {
      try {
        const info = await connectionService.getDashboardInfo();
        set({
          totalUpload: info.uploadTotal,
          totalDownload: info.downloadTotal,
          activeConnections: info.activeConnections,
          memoryInuse: info.memoryInuse,
          version: info.version,
        });
      } catch {
        // ignore polling errors
      }
    }, 2000);

    return () => {
      unsub();
      clearInterval(interval);
    };
  },

  async fetchDashboardInfo() {
    try {
      const info = await connectionService.getDashboardInfo();
      set({
        totalUpload: info.uploadTotal,
        totalDownload: info.downloadTotal,
        activeConnections: info.activeConnections,
        memoryInuse: info.memoryInuse,
        version: info.version,
      });
    } catch {
      // ignore
    }
  },
}));
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/linqiankai/calamity && npx tsc --noEmit 2>&1 | head -20`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/stores/connection.ts
git commit -m "feat: rewrite connection store with real traffic data and speed history"
```

---

### Task 5: Update DashboardPage to use real data and add new stat cards

**Files:**
- Modify: `src/pages/DashboardPage.tsx`

- [ ] **Step 1: Update DashboardPage imports and data wiring**

Replace the entire `DashboardPage.tsx` with the updated version that:
1. Calls `subscribeTraffic()` on mount (returns cleanup function)
2. Calls `fetchDashboardInfo()` on mount for initial data
3. Listens to `singbox-restarted` event to re-subscribe traffic
4. Adds stat cards for: active connections, memory usage, uptime
5. Removes `fetchSpeedHistory` (no longer needed — history built from stream)
6. Computes uptime from `startedAt`

```tsx
import { useEffect, useState, useRef } from "react";
import { Power, ArrowUp, ArrowDown, Shield, Database, LogOut, Wifi, Cpu, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useConnectionStore } from "@/stores/connection";
import { useNodesStore } from "@/stores/nodes";
import { useTailnetStore } from "@/stores/tailnet";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { cn } from "@/lib/utils";
import { countryFlag } from "@/lib/flags";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatSpeed(bytesPerSec: number): string {
  return `${formatBytes(bytesPerSec)}/s`;
}

function formatUptime(startedAt: number | null): string {
  if (!startedAt) return "0s";
  const seconds = Math.floor((Date.now() - startedAt) / 1000);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

export function DashboardPage() {
  const {
    status, activeNode, uploadSpeed, downloadSpeed,
    totalUpload, totalDownload, latency, speedHistory,
    activeConnections, memoryInuse, startedAt,
    fetchState, subscribeTraffic, fetchDashboardInfo, toggleConnection,
  } = useConnectionStore();
  const { groups, fetchGroups } = useNodesStore();
  const { devices, fetchAccount, fetchDevices } = useTailnetStore();
  const [justConnected, setJustConnected] = useState(false);
  const [uptimeStr, setUptimeStr] = useState("0s");
  const prevStatusRef = useRef(status);

  // Subscribe to traffic stream
  useEffect(() => {
    fetchState();
    fetchDashboardInfo();
    fetchGroups();
    fetchAccount();
    fetchDevices();

    let unsubTraffic = subscribeTraffic();

    // Re-subscribe when sing-box restarts
    let unlistenRestart: (() => void) | null = null;
    (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        unlistenRestart = await listen("singbox-restarted", () => {
          unsubTraffic();
          unsubTraffic = subscribeTraffic();
          fetchState();
          fetchDashboardInfo();
        });
      } catch {}
    })();

    return () => {
      unsubTraffic();
      if (unlistenRestart) unlistenRestart();
    };
  }, [fetchState, fetchDashboardInfo, subscribeTraffic, fetchGroups, fetchAccount, fetchDevices]);

  // Update uptime every second
  useEffect(() => {
    const interval = setInterval(() => {
      setUptimeStr(formatUptime(startedAt));
    }, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  useEffect(() => {
    if (prevStatusRef.current === "connecting" && status === "connected") {
      setJustConnected(true);
      const timer = setTimeout(() => setJustConnected(false), 1500);
      return () => clearTimeout(timer);
    }
    prevStatusRef.current = status;
  }, [status]);

  const isConnected = status === "connected";
  const isConnecting = status === "connecting";
  const activeNodeObj = groups.flatMap((g) => g.nodes).find((n) => n.active);
  const exitNode = devices.find((d) => d.isCurrentExitNode);

  return (
    <div className="p-6 min-h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-lg font-semibold">Network Overview</h1>
        {isConnected && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-green-500/15 px-2.5 py-0.5 text-[10px] font-semibold text-green-400 uppercase tracking-wider">
            <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
            Online
          </span>
        )}
      </div>

      {/* Center Power Ring */}
      <div className="flex-1 flex flex-col items-center justify-center -mt-4">
        {/* Power Button with Rings */}
        <div className="relative mb-6">
          <div className={cn(
            "absolute inset-[-20px] rounded-full border transition-all duration-1000",
            isConnected ? "border-primary/20" : "border-white/[0.04]",
            isConnecting && "animate-spin border-yellow-500/30"
          )} style={{ animationDuration: "3s" }} />
          <div className={cn(
            "absolute inset-[-10px] rounded-full border transition-all duration-700",
            isConnected ? "border-primary/30" : "border-white/[0.06]",
            isConnecting && "animate-spin border-yellow-500/20"
          )} style={{ animationDuration: "2s", animationDirection: "reverse" }} />
          {justConnected && (
            <div className="absolute inset-[-30px] rounded-full bg-primary/20 animate-glow-expand" />
          )}
          <button
            onClick={toggleConnection}
            className={cn(
              "relative z-10 h-28 w-28 rounded-full flex items-center justify-center transition-all duration-500",
              isConnected && "bg-gradient-to-br from-primary/20 to-primary/5 text-primary shadow-[0_0_40px_rgba(254,151,185,0.2)] animate-power-ring",
              isConnecting && "bg-gradient-to-br from-yellow-500/20 to-yellow-500/5 text-yellow-400 animate-power-connecting",
              !isConnected && !isConnecting && "bg-muted/30 text-muted-foreground hover:bg-muted/50 hover:scale-105 active:scale-95",
            )}
          >
            <Power className={cn(
              "h-10 w-10 transition-all duration-700",
              isConnecting && "rotate-180 scale-90"
            )} />
            {isConnecting && (
              <div className="absolute inset-0 rounded-full overflow-hidden">
                <div className="absolute inset-x-0 h-1/3 bg-gradient-to-b from-yellow-400/25 to-transparent animate-scan-line" />
              </div>
            )}
          </button>
        </div>

        {/* Status Text */}
        <div className="text-center mb-2">
          {isConnected && (
            <div className="animate-slide-up">
              <p className="text-sm font-semibold tracking-widest uppercase text-primary mb-0.5">Connected</p>
              <div className="flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground">
                <Shield className="h-3 w-3 text-primary" />
                <span className="uppercase tracking-wider">Protected</span>
              </div>
            </div>
          )}
          {isConnecting && (
            <p className="text-sm font-medium text-yellow-400 animate-pulse tracking-wider uppercase">
              Connecting...
            </p>
          )}
          {!isConnected && !isConnecting && (
            <p className="text-sm text-muted-foreground">Tap to connect</p>
          )}
        </div>

        {/* Active Node */}
        {isConnected && (
          <div className="flex items-center gap-2 mt-1 animate-slide-up" style={{ animationDelay: "100ms" }}>
            {exitNode ? (
              <>
                <LogOut className="h-4 w-4 text-purple-400" />
                <span className="text-sm font-medium">{exitNode.name}</span>
                <Badge variant="outline" className="text-[9px] border-purple-500/30 bg-purple-500/10 text-purple-400">Exit Node</Badge>
                <span className="text-xs text-muted-foreground">- {exitNode.ip}</span>
              </>
            ) : activeNodeObj ? (
              <>
                <span className="text-lg">{countryFlag(activeNodeObj.countryCode)}</span>
                <span className="text-sm font-medium">{activeNode}</span>
                <span className="text-xs text-muted-foreground">- {latency > 0 ? `${latency}ms` : ""}</span>
              </>
            ) : null}
          </div>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {[
          { label: "Upload", value: formatSpeed(uploadSpeed), icon: ArrowUp, iconColor: "text-primary", gradient: "from-primary/10 to-transparent" },
          { label: "Download", value: formatSpeed(downloadSpeed), icon: ArrowDown, iconColor: "text-green-400", gradient: "from-green-500/10 to-transparent" },
          { label: "Traffic", value: formatBytes(totalDownload + totalUpload), icon: Database, iconColor: "text-purple-400", gradient: "from-purple-500/10 to-transparent" },
          { label: "Connections", value: `${activeConnections}`, icon: Wifi, iconColor: "text-blue-400", gradient: "from-blue-500/10 to-transparent" },
          { label: "Memory", value: formatBytes(memoryInuse), icon: Cpu, iconColor: "text-orange-400", gradient: "from-orange-500/10 to-transparent" },
          { label: "Uptime", value: uptimeStr, icon: Clock, iconColor: "text-cyan-400", gradient: "from-cyan-500/10 to-transparent" },
        ].map((card, i) => (
          <div
            key={card.label}
            className={cn(
              "rounded-xl border border-white/[0.06] bg-gradient-to-b p-3.5 backdrop-blur-xl animate-slide-up",
              card.gradient
            )}
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className="flex items-center justify-between mb-1.5">
              <card.icon className={cn("h-3.5 w-3.5", card.iconColor)} />
              <span className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider">{card.label}</span>
            </div>
            <p className="text-lg font-bold tabular-nums">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Bandwidth Chart */}
      <div className="rounded-2xl border border-white/[0.06] bg-card/40 backdrop-blur-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium">Bandwidth History</h3>
          <span className="text-[9px] text-muted-foreground uppercase tracking-wider">Last 5 min</span>
        </div>
        <div className="h-36">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={speedHistory}>
              <defs>
                <linearGradient id="dlGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#fe97b9" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#fe97b9" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="ulGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#a4a1ff" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#a4a1ff" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="time" tick={{ fill: "#444", fontSize: 9 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis tickFormatter={(v: number) => formatBytes(v)} tick={{ fill: "#444", fontSize: 9 }} axisLine={false} tickLine={false} width={60} />
              <Tooltip
                formatter={(v) => formatSpeed(Number(v))}
                contentStyle={{ backgroundColor: "rgba(35,35,63,0.95)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "0.5rem", fontSize: "11px", color: "#e5e3ff" }}
              />
              <Area type="natural" dataKey="download" stroke="#fe97b9" strokeWidth={2} fill="url(#dlGrad)" name="Download" animationDuration={300} />
              <Area type="natural" dataKey="upload" stroke="#a4a1ff" strokeWidth={1.5} fill="url(#ulGrad)" name="Upload" animationDuration={300} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Security Footer */}
      <div className="flex items-center justify-center gap-3 pt-4 pb-1">
        <div className="h-px flex-1 bg-white/[0.04]" />
        <p className="text-[9px] text-muted-foreground/30 tracking-[0.15em] uppercase">
          TLS 1.3 - AES-256-GCM - SingBox {useConnectionStore.getState().version || "1.13.4"}
        </p>
        <div className="h-px flex-1 bg-white/[0.04]" />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/linqiankai/calamity && npx tsc --noEmit 2>&1 | head -20`
Expected: no errors

- [ ] **Step 3: Verify it builds and renders**

Run: `cd /Users/linqiankai/calamity && npm run build 2>&1 | tail -10`
Expected: build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/pages/DashboardPage.tsx
git commit -m "feat: update Dashboard with real traffic data and new stat cards"
```

---

### Task 6: Remove unused `getSpeedHistory` and `fetchSpeedHistory`

**Files:**
- Modify: `src/services/types.ts` (no changes needed — SpeedRecord stays)
- Verify: no other files reference `fetchSpeedHistory` or `getSpeedHistory`

- [ ] **Step 1: Search for remaining references**

Run: `cd /Users/linqiankai/calamity && grep -r "fetchSpeedHistory\|getSpeedHistory" src/ --include="*.ts" --include="*.tsx"`
Expected: no results (already removed from DashboardPage and connection store)

- [ ] **Step 2: Commit if any cleanup was needed**

```bash
git add -A
git commit -m "chore: remove unused fetchSpeedHistory references"
```

---

### Task 7: Integration test — run the app and verify

- [ ] **Step 1: Start the dev server**

Run: `cd /Users/linqiankai/calamity && cargo tauri dev`

- [ ] **Step 2: Verify Dashboard shows real data**

Check:
- Power button toggles proxy (sets/clears active node)
- Upload/download speed updates every second from traffic stream
- Bandwidth chart populates with real data points
- Traffic total, active connections, memory, uptime cards show non-zero values
- When sing-box restarts, traffic stream reconnects automatically
- Security footer shows actual sing-box version

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: dashboard integration fixes"
```
