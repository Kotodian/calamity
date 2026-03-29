# Calamity Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Calamity macOS proxy client frontend with Tauri v2 + React, matching the Stitch design system (pink theme, glass morphism sidebar, Material icons), using mock data for all backend interactions.

**Architecture:** Tauri v2 shell with React SPA. Fixed sidebar navigation (7 pages) + content area. Separate Tauri webview window for system tray popup. Zustand stores consume a service layer that initially points to mock implementations. Light/dark theme via Tailwind CSS variables.

**Tech Stack:** Tauri v2, React 19, TypeScript, Tailwind CSS v4, Shadcn/ui, React Router v7, Zustand, Lucide React (icons), Recharts (charts)

---

## File Structure

```
src-tauri/
├── src/
│   ├── lib.rs              # Tauri app setup, window management
│   └── tray.rs             # System tray setup, tray window creation
├── Cargo.toml
├── tauri.conf.json
└── capabilities/
    └── default.json

src/
├── main.tsx                 # Main window entry
├── tray.tsx                 # Tray popup entry
├── App.tsx                  # Router + layout for main window
├── TrayApp.tsx              # Tray popup root component
├── index.css                # Tailwind directives + CSS variables (pink theme)
├── lib/
│   └── utils.ts             # cn() helper
├── components/
│   ├── ui/                  # Shadcn/ui components (button, card, input, switch, badge, table, select, tabs, scroll-area, separator, dropdown-menu, dialog, tooltip)
│   ├── Sidebar.tsx          # Glass morphism sidebar with nav items
│   └── AppLayout.tsx        # Sidebar + Outlet wrapper
├── pages/
│   ├── DashboardPage.tsx    # Connection status, speed stats, traffic chart
│   ├── NodesPage.tsx        # Node list with latency, groups
│   ├── RulesPage.tsx        # Draggable rules list, add/edit rule
│   ├── LogsPage.tsx         # Real-time log stream, filters
│   ├── TailnetPage.tsx      # Device list, exit node selector
│   ├── DnsPage.tsx          # DNS mode, rules, cache
│   └── SettingsPage.tsx     # Theme, core path, auto-start, system proxy
├── stores/
│   ├── connection.ts        # Connection state, speed, traffic
│   ├── nodes.ts             # Node list, active node, groups
│   ├── rules.ts             # Route rules CRUD, reorder
│   ├── logs.ts              # Log entries, filters
│   ├── tailnet.ts           # Tailnet devices, exit node
│   ├── dns.ts               # DNS config, rules, cache
│   └── settings.ts          # Theme, app settings
├── services/
│   ├── types.ts             # Shared TypeScript interfaces
│   ├── connection.ts        # Connection service interface + mock
│   ├── nodes.ts             # Nodes service interface + mock
│   ├── rules.ts             # Rules service interface + mock
│   ├── logs.ts              # Logs service interface + mock
│   ├── tailnet.ts           # Tailnet service interface + mock
│   ├── dns.ts               # DNS service interface + mock
│   └── settings.ts          # Settings service interface + mock
└── tray/
    ├── TrayStatus.tsx       # Connection status + speed
    ├── TrayModeSwitch.tsx   # Rule/Global/Direct toggle
    ├── TraySiteRule.tsx      # Current website rule editor
    └── TrayActions.tsx       # System proxy toggle, quit, etc.
```

---

### Task 1: Scaffold Tauri + React Project

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `tailwind.config.ts`, `src/main.tsx`, `src/App.tsx`, `src/index.css`, `index.html`, `src-tauri/` (generated)

- [ ] **Step 1: Create Tauri v2 project**

```bash
npm create tauri-app@latest calamity-app -- --template react-ts --manager npm
# Move contents from calamity-app/ to project root
mv calamity-app/* calamity-app/.* . 2>/dev/null; rmdir calamity-app
```

- [ ] **Step 2: Install frontend dependencies**

```bash
npm install react-router-dom zustand recharts lucide-react @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities clsx tailwind-merge class-variance-authority
npm install -D @types/node
```

- [ ] **Step 3: Initialize Shadcn/ui**

```bash
npx shadcn@latest init -d
```

Select: TypeScript, style "new-york", base color "slate", CSS variables: yes.

- [ ] **Step 4: Add Shadcn/ui components**

```bash
npx shadcn@latest add button card input switch badge table select tabs scroll-area separator dropdown-menu dialog tooltip
```

- [ ] **Step 5: Set up pink theme CSS variables**

Replace `src/index.css` with:

```css
@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
}

:root {
  --radius: 0.75rem;
  --background: oklch(0.98 0.01 350);
  --foreground: oklch(0.20 0.02 350);
  --card: oklch(0.99 0.005 350);
  --card-foreground: oklch(0.20 0.02 350);
  --popover: oklch(0.99 0.005 350);
  --popover-foreground: oklch(0.20 0.02 350);
  --primary: oklch(0.65 0.20 350);
  --primary-foreground: oklch(0.98 0.01 350);
  --secondary: oklch(0.92 0.05 350);
  --secondary-foreground: oklch(0.30 0.05 350);
  --muted: oklch(0.95 0.02 350);
  --muted-foreground: oklch(0.50 0.03 350);
  --accent: oklch(0.93 0.04 350);
  --accent-foreground: oklch(0.30 0.05 350);
  --destructive: oklch(0.55 0.20 25);
  --destructive-foreground: oklch(0.98 0.01 350);
  --border: oklch(0.90 0.03 350);
  --input: oklch(0.90 0.03 350);
  --ring: oklch(0.65 0.20 350);
  --chart-1: oklch(0.65 0.20 350);
  --chart-2: oklch(0.70 0.15 340);
  --chart-3: oklch(0.75 0.10 330);
  --chart-4: oklch(0.60 0.18 10);
  --chart-5: oklch(0.55 0.15 320);
  --sidebar: oklch(0.97 0.015 350);
  --sidebar-foreground: oklch(0.30 0.03 350);
  --sidebar-primary: oklch(0.65 0.20 350);
  --sidebar-primary-foreground: oklch(0.98 0.01 350);
  --sidebar-accent: oklch(0.93 0.04 350);
  --sidebar-accent-foreground: oklch(0.30 0.05 350);
  --sidebar-border: oklch(0.90 0.03 350);
  --sidebar-ring: oklch(0.65 0.20 350);
}

.dark {
  --background: oklch(0.15 0.02 280);
  --foreground: oklch(0.92 0.01 350);
  --card: oklch(0.18 0.02 280);
  --card-foreground: oklch(0.92 0.01 350);
  --popover: oklch(0.18 0.02 280);
  --popover-foreground: oklch(0.92 0.01 350);
  --primary: oklch(0.70 0.18 350);
  --primary-foreground: oklch(0.15 0.02 280);
  --secondary: oklch(0.25 0.04 300);
  --secondary-foreground: oklch(0.85 0.03 350);
  --muted: oklch(0.22 0.03 290);
  --muted-foreground: oklch(0.60 0.03 350);
  --accent: oklch(0.25 0.04 300);
  --accent-foreground: oklch(0.85 0.03 350);
  --destructive: oklch(0.55 0.20 25);
  --destructive-foreground: oklch(0.98 0.01 350);
  --border: oklch(0.28 0.03 290);
  --input: oklch(0.28 0.03 290);
  --ring: oklch(0.70 0.18 350);
  --chart-1: oklch(0.70 0.18 350);
  --chart-2: oklch(0.65 0.15 340);
  --chart-3: oklch(0.60 0.12 330);
  --chart-4: oklch(0.55 0.16 10);
  --chart-5: oklch(0.50 0.14 320);
  --sidebar: oklch(0.17 0.025 280);
  --sidebar-foreground: oklch(0.85 0.02 350);
  --sidebar-primary: oklch(0.70 0.18 350);
  --sidebar-primary-foreground: oklch(0.15 0.02 280);
  --sidebar-accent: oklch(0.22 0.04 300);
  --sidebar-accent-foreground: oklch(0.85 0.03 350);
  --sidebar-border: oklch(0.25 0.03 290);
  --sidebar-ring: oklch(0.70 0.18 350);
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
    font-family: "Inter", system-ui, -apple-system, sans-serif;
  }
}
```

- [ ] **Step 6: Verify project builds**

```bash
npm run dev
```

Expected: Vite dev server starts on localhost:1420, default Tauri React template renders.

- [ ] **Step 7: Commit**

```bash
git init && git add -A && git commit -m "feat: scaffold Tauri v2 + React project with pink theme"
```

---

### Task 2: Service Types and Mock Data Layer

**Files:**
- Create: `src/services/types.ts`, `src/services/connection.ts`, `src/services/nodes.ts`, `src/services/rules.ts`, `src/services/logs.ts`, `src/services/tailnet.ts`, `src/services/dns.ts`, `src/services/settings.ts`

- [ ] **Step 1: Define shared types**

Create `src/services/types.ts`:

```typescript
// Connection
export type ConnectionStatus = "connected" | "disconnected" | "connecting";
export type ProxyMode = "rule" | "global" | "direct";

export interface ConnectionState {
  status: ConnectionStatus;
  mode: ProxyMode;
  activeNode: string | null;
  uploadSpeed: number;   // bytes/s
  downloadSpeed: number; // bytes/s
  totalUpload: number;   // bytes
  totalDownload: number; // bytes
  latency: number;       // ms
}

export interface SpeedRecord {
  time: string;
  upload: number;
  download: number;
}

// Nodes
export interface NodeGroup {
  id: string;
  name: string;
  nodes: Node[];
}

export interface Node {
  id: string;
  name: string;
  server: string;
  port: number;
  protocol: string;
  latency: number | null; // ms, null = untested
  country: string;
  countryCode: string;
  active: boolean;
}

// Rules
export type OutboundType = "proxy" | "direct" | "reject" | "tailnet";

export interface RouteRule {
  id: string;
  name: string;
  enabled: boolean;
  matchType: "domain-suffix" | "domain-keyword" | "domain-full" | "geosite" | "geoip" | "ip-cidr";
  matchValue: string;
  outbound: OutboundType;
  outboundNode?: string;    // node name if outbound=proxy
  outboundDevice?: string;  // tailnet device name if outbound=tailnet
  order: number;
}

// Logs
export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  source: string;
  message: string;
  metadata?: Record<string, string>;
}

// Tailnet
export type DeviceStatus = "online" | "offline";

export interface TailnetDevice {
  id: string;
  name: string;
  hostname: string;
  ip: string;
  os: string;
  status: DeviceStatus;
  lastSeen: string;
  isExitNode: boolean;
  isCurrentExitNode: boolean;
  isSelf: boolean;
}

// DNS
export type DnsMode = "fake-ip" | "redir-host" | "direct";

export interface DnsConfig {
  mode: DnsMode;
  servers: DnsServer[];
  fakeIpRange: string;
}

export interface DnsServer {
  id: string;
  name: string;
  address: string;
  enabled: boolean;
}

export interface DnsRule {
  id: string;
  domain: string;
  server: string;
  enabled: boolean;
}

export interface DnsCacheEntry {
  domain: string;
  ip: string;
  ttl: number;
  type: string;
}

// Settings
export type Theme = "light" | "dark" | "system";

export interface AppSettings {
  theme: Theme;
  singboxPath: string;
  autoStart: boolean;
  systemProxy: boolean;
  allowLan: boolean;
  httpPort: number;
  socksPort: number;
  mixedPort: number;
  logLevel: LogLevel;
}

// Tray
export interface SiteRule {
  domain: string;
  outbound: OutboundType;
  outboundNode?: string;
}
```

- [ ] **Step 2: Create connection service with mock**

Create `src/services/connection.ts`:

```typescript
import type { ConnectionState, ProxyMode, SpeedRecord } from "./types";

export interface ConnectionService {
  getState(): Promise<ConnectionState>;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  setMode(mode: ProxyMode): Promise<void>;
  getSpeedHistory(minutes: number): Promise<SpeedRecord[]>;
}

function generateSpeedHistory(minutes: number): SpeedRecord[] {
  const records: SpeedRecord[] = [];
  const now = Date.now();
  for (let i = minutes; i >= 0; i--) {
    const time = new Date(now - i * 60000);
    records.push({
      time: time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      upload: Math.random() * 2 * 1024 * 1024,
      download: Math.random() * 15 * 1024 * 1024,
    });
  }
  return records;
}

let mockState: ConnectionState = {
  status: "connected",
  mode: "rule",
  activeNode: "Tokyo 01",
  uploadSpeed: 2.4 * 1024 * 1024,
  downloadSpeed: 15.7 * 1024 * 1024,
  totalUpload: 0.3 * 1024 * 1024 * 1024,
  totalDownload: 1.2 * 1024 * 1024 * 1024,
  latency: 32,
};

export const connectionService: ConnectionService = {
  async getState() {
    return { ...mockState };
  },
  async connect() {
    mockState.status = "connected";
  },
  async disconnect() {
    mockState.status = "disconnected";
  },
  async setMode(mode: ProxyMode) {
    mockState.mode = mode;
  },
  async getSpeedHistory(minutes: number) {
    return generateSpeedHistory(minutes);
  },
};
```

- [ ] **Step 3: Create nodes service with mock**

Create `src/services/nodes.ts`:

```typescript
import type { Node, NodeGroup } from "./types";

export interface NodesService {
  getGroups(): Promise<NodeGroup[]>;
  testLatency(nodeId: string): Promise<number>;
  testAllLatency(groupId: string): Promise<void>;
  setActiveNode(nodeId: string): Promise<void>;
}

const mockNodes: NodeGroup[] = [
  {
    id: "proxy",
    name: "Proxy",
    nodes: [
      { id: "tokyo-01", name: "Tokyo 01", server: "jp1.example.com", port: 443, protocol: "VMess", latency: 32, country: "Japan", countryCode: "JP", active: true },
      { id: "tokyo-02", name: "Tokyo 02", server: "jp2.example.com", port: 443, protocol: "Trojan", latency: 45, country: "Japan", countryCode: "JP", active: false },
      { id: "us-west", name: "US West", server: "us1.example.com", port: 443, protocol: "Shadowsocks", latency: 180, country: "United States", countryCode: "US", active: false },
      { id: "sg-01", name: "Singapore 01", server: "sg1.example.com", port: 443, protocol: "VMess", latency: 68, country: "Singapore", countryCode: "SG", active: false },
      { id: "hk-01", name: "Hong Kong 01", server: "hk1.example.com", port: 443, protocol: "VLESS", latency: 55, country: "Hong Kong", countryCode: "HK", active: false },
      { id: "kr-01", name: "Korea 01", server: "kr1.example.com", port: 443, protocol: "Hysteria2", latency: 40, country: "South Korea", countryCode: "KR", active: false },
    ],
  },
  {
    id: "auto",
    name: "Auto Select",
    nodes: [
      { id: "auto-best", name: "Best Latency", server: "auto", port: 0, protocol: "URLTest", latency: 32, country: "Japan", countryCode: "JP", active: false },
    ],
  },
];

export const nodesService: NodesService = {
  async getGroups() {
    return mockNodes.map((g) => ({ ...g, nodes: g.nodes.map((n) => ({ ...n })) }));
  },
  async testLatency(nodeId: string) {
    const latency = Math.floor(Math.random() * 200) + 20;
    for (const group of mockNodes) {
      const node = group.nodes.find((n) => n.id === nodeId);
      if (node) node.latency = latency;
    }
    return latency;
  },
  async testAllLatency() {
    for (const group of mockNodes) {
      for (const node of group.nodes) {
        node.latency = Math.floor(Math.random() * 200) + 20;
      }
    }
  },
  async setActiveNode(nodeId: string) {
    for (const group of mockNodes) {
      for (const node of group.nodes) {
        node.active = node.id === nodeId;
      }
    }
  },
};
```

- [ ] **Step 4: Create rules service with mock**

Create `src/services/rules.ts`:

```typescript
import type { RouteRule } from "./types";

export interface RulesService {
  getRules(): Promise<RouteRule[]>;
  addRule(rule: Omit<RouteRule, "id" | "order">): Promise<RouteRule>;
  updateRule(id: string, updates: Partial<RouteRule>): Promise<void>;
  deleteRule(id: string): Promise<void>;
  reorderRules(orderedIds: string[]): Promise<void>;
}

let mockRules: RouteRule[] = [
  { id: "r1", name: "Google Services", enabled: true, matchType: "domain-suffix", matchValue: "google.com", outbound: "proxy", outboundNode: "Tokyo 01", order: 0 },
  { id: "r2", name: "GitHub", enabled: true, matchType: "domain-suffix", matchValue: "github.com", outbound: "proxy", outboundNode: "US West", order: 1 },
  { id: "r3", name: "China Direct", enabled: true, matchType: "geosite", matchValue: "cn", outbound: "direct", order: 2 },
  { id: "r4", name: "Ad Block", enabled: true, matchType: "geosite", matchValue: "category-ads-all", outbound: "reject", order: 3 },
  { id: "r5", name: "Home NAS", enabled: true, matchType: "domain-full", matchValue: "nas.home.arpa", outbound: "tailnet", outboundDevice: "homelab-nas", order: 4 },
  { id: "r6", name: "Streaming", enabled: false, matchType: "geosite", matchValue: "netflix", outbound: "proxy", outboundNode: "SG 01", order: 5 },
];

let nextId = 7;

export const rulesService: RulesService = {
  async getRules() {
    return mockRules.map((r) => ({ ...r })).sort((a, b) => a.order - b.order);
  },
  async addRule(rule) {
    const newRule: RouteRule = { ...rule, id: `r${nextId++}`, order: mockRules.length };
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
```

- [ ] **Step 5: Create logs service with mock**

Create `src/services/logs.ts`:

```typescript
import type { LogEntry, LogLevel } from "./types";

export interface LogsService {
  getLogs(level?: LogLevel): Promise<LogEntry[]>;
  clearLogs(): Promise<void>;
  subscribeLogs(callback: (entry: LogEntry) => void): () => void;
}

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

// Pre-populate with 50 logs
for (let i = 0; i < 50; i++) {
  mockLogs.push(generateLog());
}

export const logsService: LogsService = {
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
```

- [ ] **Step 6: Create tailnet service with mock**

Create `src/services/tailnet.ts`:

```typescript
import type { TailnetDevice } from "./types";

export interface TailnetService {
  getDevices(): Promise<TailnetDevice[]>;
  setExitNode(deviceId: string | null): Promise<void>;
}

const mockDevices: TailnetDevice[] = [
  { id: "d1", name: "MacBook Pro", hostname: "macbook-pro", ip: "100.64.0.1", os: "macOS", status: "online", lastSeen: new Date().toISOString(), isExitNode: false, isCurrentExitNode: false, isSelf: true },
  { id: "d2", name: "Home Server", hostname: "homelab-nas", ip: "100.64.0.2", os: "Linux", status: "online", lastSeen: new Date().toISOString(), isExitNode: true, isCurrentExitNode: false, isSelf: false },
  { id: "d3", name: "Office Desktop", hostname: "office-pc", ip: "100.64.0.3", os: "Windows", status: "online", lastSeen: new Date().toISOString(), isExitNode: true, isCurrentExitNode: false, isSelf: false },
  { id: "d4", name: "Raspberry Pi", hostname: "rpi-gateway", ip: "100.64.0.4", os: "Linux", status: "offline", lastSeen: new Date(Date.now() - 86400000).toISOString(), isExitNode: true, isCurrentExitNode: false, isSelf: false },
  { id: "d5", name: "iPhone", hostname: "iphone", ip: "100.64.0.5", os: "iOS", status: "online", lastSeen: new Date().toISOString(), isExitNode: false, isCurrentExitNode: false, isSelf: false },
];

export const tailnetService: TailnetService = {
  async getDevices() {
    return mockDevices.map((d) => ({ ...d }));
  },
  async setExitNode(deviceId) {
    for (const d of mockDevices) {
      d.isCurrentExitNode = d.id === deviceId;
    }
  },
};
```

- [ ] **Step 7: Create DNS service with mock**

Create `src/services/dns.ts`:

```typescript
import type { DnsCacheEntry, DnsConfig, DnsRule } from "./types";

export interface DnsService {
  getConfig(): Promise<DnsConfig>;
  updateConfig(config: Partial<DnsConfig>): Promise<void>;
  getRules(): Promise<DnsRule[]>;
  addRule(rule: Omit<DnsRule, "id">): Promise<DnsRule>;
  deleteRule(id: string): Promise<void>;
  getCache(): Promise<DnsCacheEntry[]>;
  clearCache(): Promise<void>;
}

let mockConfig: DnsConfig = {
  mode: "fake-ip",
  fakeIpRange: "198.18.0.0/15",
  servers: [
    { id: "s1", name: "Cloudflare", address: "tls://1.1.1.1", enabled: true },
    { id: "s2", name: "Google", address: "tls://8.8.8.8", enabled: true },
    { id: "s3", name: "Tailnet DNS", address: "100.100.100.100", enabled: true },
    { id: "s4", name: "AliDNS", address: "223.5.5.5", enabled: false },
  ],
};

let mockDnsRules: DnsRule[] = [
  { id: "dr1", domain: "*.cn", server: "AliDNS", enabled: true },
  { id: "dr2", domain: "*.ts.net", server: "Tailnet DNS", enabled: true },
];

let ruleId = 3;

const mockCache: DnsCacheEntry[] = [
  { domain: "www.google.com", ip: "198.18.0.1", ttl: 300, type: "fake-ip" },
  { domain: "github.com", ip: "198.18.0.2", ttl: 300, type: "fake-ip" },
  { domain: "api.github.com", ip: "198.18.0.3", ttl: 300, type: "fake-ip" },
  { domain: "cdn.jsdelivr.net", ip: "198.18.0.4", ttl: 300, type: "fake-ip" },
];

export const dnsService: DnsService = {
  async getConfig() {
    return { ...mockConfig, servers: mockConfig.servers.map((s) => ({ ...s })) };
  },
  async updateConfig(config) {
    mockConfig = { ...mockConfig, ...config };
  },
  async getRules() {
    return mockDnsRules.map((r) => ({ ...r }));
  },
  async addRule(rule) {
    const newRule = { ...rule, id: `dr${ruleId++}` };
    mockDnsRules.push(newRule);
    return { ...newRule };
  },
  async deleteRule(id) {
    mockDnsRules = mockDnsRules.filter((r) => r.id !== id);
  },
  async getCache() {
    return mockCache.map((c) => ({ ...c }));
  },
  async clearCache() {
    mockCache.length = 0;
  },
};
```

- [ ] **Step 8: Create settings service with mock**

Create `src/services/settings.ts`:

```typescript
import type { AppSettings, Theme } from "./types";

export interface SettingsService {
  getSettings(): Promise<AppSettings>;
  updateSettings(settings: Partial<AppSettings>): Promise<void>;
  setTheme(theme: Theme): Promise<void>;
}

let mockSettings: AppSettings = {
  theme: "light",
  singboxPath: "/usr/local/bin/sing-box",
  autoStart: false,
  systemProxy: true,
  allowLan: false,
  httpPort: 7890,
  socksPort: 7891,
  mixedPort: 7892,
  logLevel: "info",
};

export const settingsService: SettingsService = {
  async getSettings() {
    return { ...mockSettings };
  },
  async updateSettings(settings) {
    mockSettings = { ...mockSettings, ...settings };
  },
  async setTheme(theme) {
    mockSettings.theme = theme;
  },
};
```

- [ ] **Step 9: Verify types compile**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 10: Commit**

```bash
git add src/services/ && git commit -m "feat: add service types and mock data layer"
```

---

### Task 3: Zustand Stores

**Files:**
- Create: `src/stores/connection.ts`, `src/stores/nodes.ts`, `src/stores/rules.ts`, `src/stores/logs.ts`, `src/stores/tailnet.ts`, `src/stores/dns.ts`, `src/stores/settings.ts`

- [ ] **Step 1: Create connection store**

Create `src/stores/connection.ts`:

```typescript
import { create } from "zustand";
import { connectionService } from "../services/connection";
import type { ConnectionState, ProxyMode, SpeedRecord } from "../services/types";

interface ConnectionStore extends ConnectionState {
  speedHistory: SpeedRecord[];
  fetchState: () => Promise<void>;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  toggleConnection: () => Promise<void>;
  setMode: (mode: ProxyMode) => Promise<void>;
  fetchSpeedHistory: () => Promise<void>;
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

  async fetchState() {
    const state = await connectionService.getState();
    set(state);
  },
  async connect() {
    set({ status: "connecting" });
    await connectionService.connect();
    set({ status: "connected" });
  },
  async disconnect() {
    await connectionService.disconnect();
    set({ status: "disconnected" });
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
  async fetchSpeedHistory() {
    const history = await connectionService.getSpeedHistory(30);
    set({ speedHistory: history });
  },
}));
```

- [ ] **Step 2: Create nodes store**

Create `src/stores/nodes.ts`:

```typescript
import { create } from "zustand";
import { nodesService } from "../services/nodes";
import type { NodeGroup } from "../services/types";

interface NodesStore {
  groups: NodeGroup[];
  selectedGroup: string;
  testing: boolean;
  fetchGroups: () => Promise<void>;
  selectGroup: (groupId: string) => void;
  testLatency: (nodeId: string) => Promise<void>;
  testAllLatency: () => Promise<void>;
  setActiveNode: (nodeId: string) => Promise<void>;
}

export const useNodesStore = create<NodesStore>((set, get) => ({
  groups: [],
  selectedGroup: "proxy",
  testing: false,

  async fetchGroups() {
    const groups = await nodesService.getGroups();
    set({ groups });
  },
  selectGroup(groupId) {
    set({ selectedGroup: groupId });
  },
  async testLatency(nodeId) {
    await nodesService.testLatency(nodeId);
    await get().fetchGroups();
  },
  async testAllLatency() {
    set({ testing: true });
    await nodesService.testAllLatency(get().selectedGroup);
    await get().fetchGroups();
    set({ testing: false });
  },
  async setActiveNode(nodeId) {
    await nodesService.setActiveNode(nodeId);
    await get().fetchGroups();
  },
}));
```

- [ ] **Step 3: Create rules store**

Create `src/stores/rules.ts`:

```typescript
import { create } from "zustand";
import { rulesService } from "../services/rules";
import type { RouteRule } from "../services/types";

interface RulesStore {
  rules: RouteRule[];
  fetchRules: () => Promise<void>;
  addRule: (rule: Omit<RouteRule, "id" | "order">) => Promise<void>;
  updateRule: (id: string, updates: Partial<RouteRule>) => Promise<void>;
  deleteRule: (id: string) => Promise<void>;
  reorderRules: (orderedIds: string[]) => Promise<void>;
}

export const useRulesStore = create<RulesStore>((set, get) => ({
  rules: [],

  async fetchRules() {
    const rules = await rulesService.getRules();
    set({ rules });
  },
  async addRule(rule) {
    await rulesService.addRule(rule);
    await get().fetchRules();
  },
  async updateRule(id, updates) {
    await rulesService.updateRule(id, updates);
    await get().fetchRules();
  },
  async deleteRule(id) {
    await rulesService.deleteRule(id);
    await get().fetchRules();
  },
  async reorderRules(orderedIds) {
    await rulesService.reorderRules(orderedIds);
    await get().fetchRules();
  },
}));
```

- [ ] **Step 4: Create logs store**

Create `src/stores/logs.ts`:

```typescript
import { create } from "zustand";
import { logsService } from "../services/logs";
import type { LogEntry, LogLevel } from "../services/types";

interface LogsStore {
  logs: LogEntry[];
  filter: LogLevel | null;
  search: string;
  autoScroll: boolean;
  fetchLogs: () => Promise<void>;
  setFilter: (level: LogLevel | null) => void;
  setSearch: (search: string) => void;
  setAutoScroll: (auto: boolean) => void;
  clearLogs: () => Promise<void>;
  subscribe: () => () => void;
  filteredLogs: () => LogEntry[];
}

export const useLogsStore = create<LogsStore>((set, get) => ({
  logs: [],
  filter: null,
  search: "",
  autoScroll: true,

  async fetchLogs() {
    const logs = await logsService.getLogs();
    set({ logs });
  },
  setFilter(level) {
    set({ filter: level });
  },
  setSearch(search) {
    set({ search });
  },
  setAutoScroll(auto) {
    set({ autoScroll: auto });
  },
  async clearLogs() {
    await logsService.clearLogs();
    set({ logs: [] });
  },
  subscribe() {
    return logsService.subscribeLogs((entry) => {
      set((state) => ({ logs: [...state.logs.slice(-499), entry] }));
    });
  },
  filteredLogs() {
    const { logs, filter, search } = get();
    return logs.filter((l) => {
      if (filter && l.level !== filter) return false;
      if (search && !l.message.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  },
}));
```

- [ ] **Step 5: Create tailnet store**

Create `src/stores/tailnet.ts`:

```typescript
import { create } from "zustand";
import { tailnetService } from "../services/tailnet";
import type { TailnetDevice } from "../services/types";

interface TailnetStore {
  devices: TailnetDevice[];
  fetchDevices: () => Promise<void>;
  setExitNode: (deviceId: string | null) => Promise<void>;
}

export const useTailnetStore = create<TailnetStore>((set, get) => ({
  devices: [],

  async fetchDevices() {
    const devices = await tailnetService.getDevices();
    set({ devices });
  },
  async setExitNode(deviceId) {
    await tailnetService.setExitNode(deviceId);
    await get().fetchDevices();
  },
}));
```

- [ ] **Step 6: Create dns store**

Create `src/stores/dns.ts`:

```typescript
import { create } from "zustand";
import { dnsService } from "../services/dns";
import type { DnsCacheEntry, DnsConfig, DnsRule } from "../services/types";

interface DnsStore {
  config: DnsConfig | null;
  rules: DnsRule[];
  cache: DnsCacheEntry[];
  fetchConfig: () => Promise<void>;
  updateConfig: (config: Partial<DnsConfig>) => Promise<void>;
  fetchRules: () => Promise<void>;
  addRule: (rule: Omit<DnsRule, "id">) => Promise<void>;
  deleteRule: (id: string) => Promise<void>;
  fetchCache: () => Promise<void>;
  clearCache: () => Promise<void>;
}

export const useDnsStore = create<DnsStore>((set, get) => ({
  config: null,
  rules: [],
  cache: [],

  async fetchConfig() {
    const config = await dnsService.getConfig();
    set({ config });
  },
  async updateConfig(config) {
    await dnsService.updateConfig(config);
    await get().fetchConfig();
  },
  async fetchRules() {
    const rules = await dnsService.getRules();
    set({ rules });
  },
  async addRule(rule) {
    await dnsService.addRule(rule);
    await get().fetchRules();
  },
  async deleteRule(id) {
    await dnsService.deleteRule(id);
    await get().fetchRules();
  },
  async fetchCache() {
    const cache = await dnsService.getCache();
    set({ cache });
  },
  async clearCache() {
    await dnsService.clearCache();
    set({ cache: [] });
  },
}));
```

- [ ] **Step 7: Create settings store**

Create `src/stores/settings.ts`:

```typescript
import { create } from "zustand";
import { settingsService } from "../services/settings";
import type { AppSettings, Theme } from "../services/types";

interface SettingsStore {
  settings: AppSettings | null;
  fetchSettings: () => Promise<void>;
  updateSettings: (settings: Partial<AppSettings>) => Promise<void>;
  setTheme: (theme: Theme) => void;
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  settings: null,

  async fetchSettings() {
    const settings = await settingsService.getSettings();
    set({ settings });
    applyTheme(settings.theme);
  },
  async updateSettings(updates) {
    await settingsService.updateSettings(updates);
    await get().fetchSettings();
  },
  setTheme(theme) {
    applyTheme(theme);
    get().updateSettings({ theme });
  },
}));

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "dark") {
    root.classList.add("dark");
  } else if (theme === "light") {
    root.classList.remove("dark");
  } else {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.classList.toggle("dark", prefersDark);
  }
}
```

- [ ] **Step 8: Verify types compile**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 9: Commit**

```bash
git add src/stores/ && git commit -m "feat: add Zustand stores for all modules"
```

---

### Task 4: App Layout — Sidebar + Router

**Files:**
- Create: `src/components/Sidebar.tsx`, `src/components/AppLayout.tsx`
- Modify: `src/App.tsx`, `src/main.tsx`

- [ ] **Step 1: Create Sidebar component**

Create `src/components/Sidebar.tsx`:

```tsx
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Globe,
  Route,
  ScrollText,
  Network,
  Dns,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useConnectionStore } from "@/stores/connection";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/nodes", icon: Globe, label: "Nodes" },
  { to: "/rules", icon: Route, label: "Rules" },
  { to: "/logs", icon: ScrollText, label: "Logs" },
  { to: "/tailnet", icon: Network, label: "Tailnet" },
  { to: "/dns", icon: Dns, label: "DNS" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export function Sidebar() {
  const status = useConnectionStore((s) => s.status);

  return (
    <aside className="flex h-screen w-56 flex-col border-r border-border/50 bg-sidebar/80 backdrop-blur-xl">
      {/* macOS traffic light spacer */}
      <div className="h-12 flex items-center px-5 pt-2" data-tauri-drag-region>
        <span className="text-lg font-semibold text-primary">Calamity</span>
      </div>

      {/* Status indicator */}
      <div className="mx-4 mb-3 flex items-center gap-2 rounded-lg bg-accent/50 px-3 py-2">
        <span
          className={cn(
            "h-2 w-2 rounded-full",
            status === "connected" && "bg-green-500",
            status === "connecting" && "bg-yellow-500 animate-pulse",
            status === "disconnected" && "bg-muted-foreground/40"
          )}
        />
        <span className="text-xs font-medium text-muted-foreground capitalize">
          {status}
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent"
              )
            }
          >
            <Icon className="h-4 w-4" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-border/50 p-4">
        <p className="text-[10px] text-muted-foreground/60 text-center">
          SingBox Core v1.8.4
        </p>
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Create AppLayout**

Create `src/components/AppLayout.tsx`:

```tsx
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";

export function AppLayout() {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Set up routing in App.tsx**

Replace `src/App.tsx`:

```tsx
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { DashboardPage } from "./pages/DashboardPage";
import { NodesPage } from "./pages/NodesPage";
import { RulesPage } from "./pages/RulesPage";
import { LogsPage } from "./pages/LogsPage";
import { TailnetPage } from "./pages/TailnetPage";
import { DnsPage } from "./pages/DnsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { useEffect } from "react";
import { useSettingsStore } from "./stores/settings";
import { useConnectionStore } from "./stores/connection";

export default function App() {
  const fetchSettings = useSettingsStore((s) => s.fetchSettings);
  const fetchConnectionState = useConnectionStore((s) => s.fetchState);

  useEffect(() => {
    fetchSettings();
    fetchConnectionState();
  }, [fetchSettings, fetchConnectionState]);

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="nodes" element={<NodesPage />} />
          <Route path="rules" element={<RulesPage />} />
          <Route path="logs" element={<LogsPage />} />
          <Route path="tailnet" element={<TailnetPage />} />
          <Route path="dns" element={<DnsPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
```

- [ ] **Step 4: Create placeholder page components**

Create each page file with a minimal placeholder. Example for `src/pages/DashboardPage.tsx`:

```tsx
export function DashboardPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
    </div>
  );
}
```

Create identical placeholders for: `NodesPage.tsx`, `RulesPage.tsx`, `LogsPage.tsx`, `TailnetPage.tsx`, `DnsPage.tsx`, `SettingsPage.tsx` — each with its own title.

- [ ] **Step 5: Update main.tsx entry**

Replace `src/main.tsx`:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 6: Verify sidebar renders and navigation works**

```bash
npm run dev
```

Expected: App renders with pink sidebar, 7 nav items, clicking each shows the page title. Active nav item is highlighted in pink.

- [ ] **Step 7: Commit**

```bash
git add src/ && git commit -m "feat: add sidebar layout and React Router navigation"
```

---

### Task 5: Dashboard Page

**Files:**
- Modify: `src/pages/DashboardPage.tsx`

- [ ] **Step 1: Build Dashboard page**

Replace `src/pages/DashboardPage.tsx`:

```tsx
import { useEffect } from "react";
import { Power } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useConnectionStore } from "@/stores/connection";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatSpeed(bytesPerSec: number): string {
  return `${formatBytes(bytesPerSec)}/s`;
}

export function DashboardPage() {
  const {
    status,
    mode,
    activeNode,
    uploadSpeed,
    downloadSpeed,
    totalUpload,
    totalDownload,
    latency,
    speedHistory,
    fetchState,
    toggleConnection,
    fetchSpeedHistory,
  } = useConnectionStore();

  useEffect(() => {
    fetchState();
    fetchSpeedHistory();
  }, [fetchState, fetchSpeedHistory]);

  const isConnected = status === "connected";

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      {/* Connection Control */}
      <Card>
        <CardContent className="flex items-center gap-6 p-6">
          <Button
            variant={isConnected ? "default" : "outline"}
            size="icon"
            className="h-16 w-16 rounded-full"
            onClick={toggleConnection}
          >
            <Power className="h-7 w-7" />
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Badge variant={isConnected ? "default" : "secondary"}>
                {status.toUpperCase()}
              </Badge>
              <Badge variant="outline" className="capitalize">
                {mode}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {isConnected
                ? `Connected to ${activeNode} • ${latency}ms`
                : "Tap to connect"}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              LATENCY
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{latency}ms</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              UPLOAD
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatSpeed(uploadSpeed)}</p>
            <p className="text-xs text-muted-foreground">{formatBytes(totalUpload)} total</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              DOWNLOAD
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatSpeed(downloadSpeed)}</p>
            <p className="text-xs text-muted-foreground">{formatBytes(totalDownload)} total</p>
          </CardContent>
        </Card>
      </div>

      {/* Speed Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Bandwidth History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={speedHistory}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="time" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                <YAxis
                  tickFormatter={(v: number) => formatBytes(v)}
                  className="text-xs"
                  tick={{ fill: "hsl(var(--muted-foreground))" }}
                  width={70}
                />
                <Tooltip
                  formatter={(v: number) => formatSpeed(v)}
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "0.5rem",
                    fontSize: "12px",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="download"
                  stroke="hsl(var(--primary))"
                  fill="hsl(var(--primary) / 0.15)"
                  name="Download"
                />
                <Area
                  type="monotone"
                  dataKey="upload"
                  stroke="hsl(var(--chart-3))"
                  fill="hsl(var(--chart-3) / 0.15)"
                  name="Upload"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Footer */}
      <p className="text-center text-[10px] text-muted-foreground/50 tracking-widest">
        ENCRYPTED WITH TLS 1.3 • AES-256-GCM • SING-BOX CORE 1.8.4
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Verify Dashboard renders**

```bash
npm run dev
```

Expected: Dashboard shows connection button, stats cards, speed chart with mock data.

- [ ] **Step 3: Commit**

```bash
git add src/pages/DashboardPage.tsx && git commit -m "feat: implement Dashboard page with stats and speed chart"
```

---

### Task 6: Nodes Page

**Files:**
- Modify: `src/pages/NodesPage.tsx`

- [ ] **Step 1: Build Nodes page**

Replace `src/pages/NodesPage.tsx`:

```tsx
import { useEffect } from "react";
import { Zap, Check, Wifi } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useNodesStore } from "@/stores/nodes";
import { cn } from "@/lib/utils";

function latencyColor(ms: number | null): string {
  if (ms === null) return "text-muted-foreground";
  if (ms < 80) return "text-green-500";
  if (ms < 150) return "text-yellow-500";
  return "text-red-500";
}

const flagEmoji: Record<string, string> = {
  JP: "\u{1F1EF}\u{1F1F5}",
  US: "\u{1F1FA}\u{1F1F8}",
  SG: "\u{1F1F8}\u{1F1EC}",
  HK: "\u{1F1ED}\u{1F1F0}",
  KR: "\u{1F1F0}\u{1F1F7}",
};

export function NodesPage() {
  const { groups, selectedGroup, testing, fetchGroups, selectGroup, testAllLatency, setActiveNode } =
    useNodesStore();

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  const currentGroup = groups.find((g) => g.id === selectedGroup);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Nodes</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={testAllLatency}
          disabled={testing}
        >
          <Zap className="mr-2 h-3.5 w-3.5" />
          {testing ? "Testing..." : "Test All"}
        </Button>
      </div>

      <Tabs value={selectedGroup} onValueChange={selectGroup}>
        <TabsList>
          {groups.map((g) => (
            <TabsTrigger key={g.id} value={g.id}>
              {g.name}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="grid gap-3">
        {currentGroup?.nodes.map((node) => (
          <Card
            key={node.id}
            className={cn(
              "cursor-pointer transition-all hover:shadow-md",
              node.active && "ring-2 ring-primary"
            )}
            onClick={() => setActiveNode(node.id)}
          >
            <CardContent className="flex items-center gap-4 p-4">
              <span className="text-2xl">
                {flagEmoji[node.countryCode] ?? "\u{1F310}"}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">{node.name}</span>
                  {node.active && (
                    <Badge variant="default" className="h-5 text-[10px]">
                      <Check className="mr-1 h-3 w-3" /> Active
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {node.protocol} • {node.server}
                </p>
              </div>
              <div className={cn("flex items-center gap-1 text-sm font-mono", latencyColor(node.latency))}>
                <Wifi className="h-3.5 w-3.5" />
                {node.latency !== null ? `${node.latency}ms` : "—"}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify Nodes page**

```bash
npm run dev
```

Expected: Shows node list grouped by tabs, active node highlighted, latency shown with color coding.

- [ ] **Step 3: Commit**

```bash
git add src/pages/NodesPage.tsx && git commit -m "feat: implement Nodes page with latency testing"
```

---

### Task 7: Rules Page with Drag-and-Drop

**Files:**
- Modify: `src/pages/RulesPage.tsx`

- [ ] **Step 1: Build Rules page**

Replace `src/pages/RulesPage.tsx`:

```tsx
import { useEffect, useState } from "react";
import { GripVertical, Plus, Trash2, Pencil } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useRulesStore } from "@/stores/rules";
import type { OutboundType, RouteRule } from "@/services/types";
import { cn } from "@/lib/utils";

const outboundColors: Record<OutboundType, string> = {
  proxy: "border-l-primary",
  direct: "border-l-green-500",
  reject: "border-l-red-500",
  tailnet: "border-l-teal-500",
};

const outboundLabels: Record<OutboundType, string> = {
  proxy: "Proxy",
  direct: "DIRECT",
  reject: "REJECT",
  tailnet: "Tailnet",
};

function SortableRule({
  rule,
  onToggle,
  onEdit,
  onDelete,
}: {
  rule: RouteRule;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: rule.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={cn("border-l-4", outboundColors[rule.outbound], !rule.enabled && "opacity-50")}
    >
      <CardContent className="flex items-center gap-3 p-3">
        <button {...attributes} {...listeners} className="cursor-grab text-muted-foreground hover:text-foreground">
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{rule.name}</span>
            <Badge variant="outline" className="text-[10px]">
              {rule.matchType}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground truncate">
            {rule.matchValue} → {outboundLabels[rule.outbound]}
            {rule.outboundNode && `: ${rule.outboundNode}`}
            {rule.outboundDevice && `: ${rule.outboundDevice}`}
          </p>
        </div>
        <Switch checked={rule.enabled} onCheckedChange={onToggle} />
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </CardContent>
    </Card>
  );
}

type RuleFormData = Omit<RouteRule, "id" | "order">;

const defaultForm: RuleFormData = {
  name: "",
  enabled: true,
  matchType: "domain-suffix",
  matchValue: "",
  outbound: "proxy",
  outboundNode: "",
  outboundDevice: "",
};

export function RulesPage() {
  const { rules, fetchRules, addRule, updateRule, deleteRule, reorderRules } = useRulesStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<RuleFormData>(defaultForm);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const ids = rules.map((r) => r.id);
      const oldIndex = ids.indexOf(active.id as string);
      const newIndex = ids.indexOf(over.id as string);
      const newIds = [...ids];
      newIds.splice(oldIndex, 1);
      newIds.splice(newIndex, 0, active.id as string);
      reorderRules(newIds);
    }
  }

  function openAdd() {
    setEditingId(null);
    setForm(defaultForm);
    setDialogOpen(true);
  }

  function openEdit(rule: RouteRule) {
    setEditingId(rule.id);
    setForm({
      name: rule.name,
      enabled: rule.enabled,
      matchType: rule.matchType,
      matchValue: rule.matchValue,
      outbound: rule.outbound,
      outboundNode: rule.outboundNode,
      outboundDevice: rule.outboundDevice,
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (editingId) {
      await updateRule(editingId, form);
    } else {
      await addRule(form);
    }
    setDialogOpen(false);
  }

  const activeCount = rules.filter((r) => r.enabled).length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Rules</h1>
          <p className="text-sm text-muted-foreground">
            {rules.length} rules • {activeCount} active
          </p>
        </div>
        <Button onClick={openAdd}>
          <Plus className="mr-2 h-4 w-4" /> Add Rule
        </Button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={rules.map((r) => r.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {rules.map((rule) => (
              <SortableRule
                key={rule.id}
                rule={rule}
                onToggle={() => updateRule(rule.id, { enabled: !rule.enabled })}
                onEdit={() => openEdit(rule)}
                onDelete={() => deleteRule(rule.id)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Rule" : "Add Rule"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              placeholder="Rule name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <Select
              value={form.matchType}
              onValueChange={(v) => setForm({ ...form, matchType: v as RouteRule["matchType"] })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="domain-suffix">domain-suffix</SelectItem>
                <SelectItem value="domain-keyword">domain-keyword</SelectItem>
                <SelectItem value="domain-full">domain-full</SelectItem>
                <SelectItem value="geosite">geosite</SelectItem>
                <SelectItem value="geoip">geoip</SelectItem>
                <SelectItem value="ip-cidr">ip-cidr</SelectItem>
              </SelectContent>
            </Select>
            <Input
              placeholder="Match value"
              value={form.matchValue}
              onChange={(e) => setForm({ ...form, matchValue: e.target.value })}
            />
            <Select
              value={form.outbound}
              onValueChange={(v) => setForm({ ...form, outbound: v as OutboundType })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="proxy">Proxy</SelectItem>
                <SelectItem value="direct">DIRECT</SelectItem>
                <SelectItem value="reject">REJECT</SelectItem>
                <SelectItem value="tailnet">Tailnet</SelectItem>
              </SelectContent>
            </Select>
            {form.outbound === "proxy" && (
              <Input
                placeholder="Node name (e.g. Tokyo 01)"
                value={form.outboundNode ?? ""}
                onChange={(e) => setForm({ ...form, outboundNode: e.target.value })}
              />
            )}
            {form.outbound === "tailnet" && (
              <Input
                placeholder="Tailnet device name"
                value={form.outboundDevice ?? ""}
                onChange={(e) => setForm({ ...form, outboundDevice: e.target.value })}
              />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 2: Verify Rules page**

```bash
npm run dev
```

Expected: Rules list with drag handles, colored left borders, add/edit dialog, toggle switches.

- [ ] **Step 3: Commit**

```bash
git add src/pages/RulesPage.tsx && git commit -m "feat: implement Rules page with drag-and-drop reordering"
```

---

### Task 8: Logs Page

**Files:**
- Modify: `src/pages/LogsPage.tsx`

- [ ] **Step 1: Build Logs page**

Replace `src/pages/LogsPage.tsx`:

```tsx
import { useEffect, useRef } from "react";
import { Trash2, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLogsStore } from "@/stores/logs";
import type { LogLevel } from "@/services/types";
import { cn } from "@/lib/utils";

const levelStyles: Record<LogLevel, string> = {
  debug: "bg-muted text-muted-foreground",
  info: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  warn: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300",
  error: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
};

export function LogsPage() {
  const { logs, filter, search, autoScroll, fetchLogs, setFilter, setSearch, clearLogs, subscribe, filteredLogs } =
    useLogsStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchLogs();
    const unsub = subscribe();
    return unsub;
  }, [fetchLogs, subscribe]);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const filtered = filteredLogs();

  return (
    <div className="flex h-full flex-col p-6 gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Logs</h1>
        <Button variant="outline" size="sm" onClick={clearLogs}>
          <Trash2 className="mr-2 h-3.5 w-3.5" /> Clear
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <Tabs value={filter ?? "all"} onValueChange={(v) => setFilter(v === "all" ? null : (v as LogLevel))}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="debug">Debug</TabsTrigger>
            <TabsTrigger value="info">Info</TabsTrigger>
            <TabsTrigger value="warn">Warn</TabsTrigger>
            <TabsTrigger value="error">Error</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search logs..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <Card className="flex-1 overflow-hidden">
        <ScrollArea className="h-full" ref={scrollRef}>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {filtered.map((entry) => (
                <div key={entry.id} className="flex items-start gap-3 px-4 py-2 text-xs font-mono">
                  <span className="shrink-0 text-muted-foreground w-20">
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </span>
                  <Badge className={cn("shrink-0 text-[9px] uppercase", levelStyles[entry.level])}>
                    {entry.level}
                  </Badge>
                  <span className="shrink-0 text-muted-foreground w-16">[{entry.source}]</span>
                  <span className="break-all">{entry.message}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </ScrollArea>
      </Card>

      <p className="text-xs text-muted-foreground text-center">
        {filtered.length} entries shown • Auto-scroll {autoScroll ? "on" : "off"}
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Verify Logs page**

```bash
npm run dev
```

Expected: Logs page shows real-time log entries appearing every 2s, filterable by level, searchable.

- [ ] **Step 3: Commit**

```bash
git add src/pages/LogsPage.tsx && git commit -m "feat: implement Logs page with real-time streaming"
```

---

### Task 9: Tailnet Page

**Files:**
- Modify: `src/pages/TailnetPage.tsx`

- [ ] **Step 1: Build Tailnet page**

Replace `src/pages/TailnetPage.tsx`:

```tsx
import { useEffect } from "react";
import { Monitor, Smartphone, Server, LogOut } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTailnetStore } from "@/stores/tailnet";
import { cn } from "@/lib/utils";
import type { TailnetDevice } from "@/services/types";

function deviceIcon(os: string) {
  switch (os.toLowerCase()) {
    case "macos":
    case "windows":
    case "linux":
      return Monitor;
    case "ios":
    case "android":
      return Smartphone;
    default:
      return Server;
  }
}

function DeviceCard({ device, onSetExitNode }: { device: TailnetDevice; onSetExitNode: (id: string | null) => void }) {
  const Icon = deviceIcon(device.os);
  const isOnline = device.status === "online";

  return (
    <Card className={cn(!isOnline && "opacity-50")}>
      <CardContent className="flex items-center gap-4 p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent">
          <Icon className="h-5 w-5 text-accent-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium truncate">{device.name}</span>
            {device.isSelf && (
              <Badge variant="outline" className="text-[10px]">This device</Badge>
            )}
            <span className={cn("h-2 w-2 rounded-full", isOnline ? "bg-green-500" : "bg-muted-foreground/40")} />
          </div>
          <p className="text-xs text-muted-foreground">
            {device.ip} • {device.os} • {device.hostname}
          </p>
        </div>
        {device.isExitNode && !device.isSelf && (
          <Button
            variant={device.isCurrentExitNode ? "default" : "outline"}
            size="sm"
            onClick={() => onSetExitNode(device.isCurrentExitNode ? null : device.id)}
            disabled={!isOnline}
          >
            <LogOut className="mr-2 h-3.5 w-3.5" />
            {device.isCurrentExitNode ? "Exit Node Active" : "Use as Exit Node"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export function TailnetPage() {
  const { devices, fetchDevices, setExitNode } = useTailnetStore();

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  const onlineCount = devices.filter((d) => d.status === "online").length;
  const currentExit = devices.find((d) => d.isCurrentExitNode);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Tailnet</h1>
        <p className="text-sm text-muted-foreground">
          {onlineCount}/{devices.length} devices online
          {currentExit && ` • Exit node: ${currentExit.name}`}
        </p>
      </div>

      {/* Exit Node Status */}
      <Card className="bg-accent/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Exit Node</CardTitle>
        </CardHeader>
        <CardContent>
          {currentExit ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{currentExit.name}</p>
                <p className="text-xs text-muted-foreground">{currentExit.ip}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setExitNode(null)}>
                Disconnect
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No exit node selected</p>
          )}
        </CardContent>
      </Card>

      {/* Device List */}
      <div className="space-y-3">
        {devices.map((device) => (
          <DeviceCard key={device.id} device={device} onSetExitNode={setExitNode} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify Tailnet page**

```bash
npm run dev
```

Expected: Device list with online/offline status, exit node selection, no MagicDNS or subnet routes.

- [ ] **Step 3: Commit**

```bash
git add src/pages/TailnetPage.tsx && git commit -m "feat: implement Tailnet page with device list and exit node"
```

---

### Task 10: DNS Page

**Files:**
- Modify: `src/pages/DnsPage.tsx`

- [ ] **Step 1: Build DNS page**

Replace `src/pages/DnsPage.tsx`:

```tsx
import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDnsStore } from "@/stores/dns";
import type { DnsMode } from "@/services/types";

export function DnsPage() {
  const { config, rules, cache, fetchConfig, updateConfig, fetchRules, addRule, deleteRule, fetchCache, clearCache } =
    useDnsStore();

  const [newDomain, setNewDomain] = useState("");
  const [newServer, setNewServer] = useState("");

  useEffect(() => {
    fetchConfig();
    fetchRules();
    fetchCache();
  }, [fetchConfig, fetchRules, fetchCache]);

  if (!config) return null;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">DNS</h1>

      <Tabs defaultValue="config">
        <TabsList>
          <TabsTrigger value="config">Configuration</TabsTrigger>
          <TabsTrigger value="rules">DNS Rules</TabsTrigger>
          <TabsTrigger value="cache">Cache</TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="space-y-4 mt-4">
          {/* DNS Mode */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">DNS Mode</CardTitle>
            </CardHeader>
            <CardContent>
              <Select
                value={config.mode}
                onValueChange={(v) => updateConfig({ mode: v as DnsMode })}
              >
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fake-ip">Fake-IP</SelectItem>
                  <SelectItem value="redir-host">Redir-Host</SelectItem>
                  <SelectItem value="direct">Direct</SelectItem>
                </SelectContent>
              </Select>
              {config.mode === "fake-ip" && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Fake-IP range: {config.fakeIpRange}
                </p>
              )}
            </CardContent>
          </Card>

          {/* DNS Servers */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">DNS Servers</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {config.servers.map((server) => (
                <div key={server.id} className="flex items-center gap-3">
                  <Switch
                    checked={server.enabled}
                    onCheckedChange={(checked) => {
                      const servers = config.servers.map((s) =>
                        s.id === server.id ? { ...s, enabled: checked } : s
                      );
                      updateConfig({ servers });
                    }}
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{server.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{server.address}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rules" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm">DNS Rules</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Domain pattern (e.g. *.example.com)"
                  value={newDomain}
                  onChange={(e) => setNewDomain(e.target.value)}
                  className="flex-1"
                />
                <Input
                  placeholder="DNS server name"
                  value={newServer}
                  onChange={(e) => setNewServer(e.target.value)}
                  className="w-40"
                />
                <Button
                  size="icon"
                  onClick={() => {
                    if (newDomain && newServer) {
                      addRule({ domain: newDomain, server: newServer, enabled: true });
                      setNewDomain("");
                      setNewServer("");
                    }
                  }}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="space-y-2">
                {rules.map((rule) => (
                  <div key={rule.id} className="flex items-center gap-3 rounded-lg border p-3">
                    <div className="flex-1">
                      <p className="text-sm font-mono">{rule.domain}</p>
                      <p className="text-xs text-muted-foreground">→ {rule.server}</p>
                    </div>
                    <Badge variant={rule.enabled ? "default" : "secondary"}>
                      {rule.enabled ? "Active" : "Disabled"}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() => deleteRule(rule.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cache" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm">DNS Cache</CardTitle>
              <Button variant="outline" size="sm" onClick={clearCache}>
                <Trash2 className="mr-2 h-3.5 w-3.5" /> Clear Cache
              </Button>
            </CardHeader>
            <CardContent>
              {cache.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Cache is empty</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Domain</TableHead>
                      <TableHead>IP</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">TTL</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cache.map((entry) => (
                      <TableRow key={entry.domain}>
                        <TableCell className="font-mono text-xs">{entry.domain}</TableCell>
                        <TableCell className="font-mono text-xs">{entry.ip}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">{entry.type}</Badge>
                        </TableCell>
                        <TableCell className="text-right text-xs">{entry.ttl}s</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 2: Verify DNS page**

```bash
npm run dev
```

Expected: DNS config with mode selector, server toggles, DNS rules CRUD, cache table with clear button.

- [ ] **Step 3: Commit**

```bash
git add src/pages/DnsPage.tsx && git commit -m "feat: implement DNS page with config, rules, and cache"
```

---

### Task 11: Settings Page

**Files:**
- Modify: `src/pages/SettingsPage.tsx`

- [ ] **Step 1: Build Settings page**

Replace `src/pages/SettingsPage.tsx`:

```tsx
import { useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSettingsStore } from "@/stores/settings";
import type { LogLevel, Theme } from "@/services/types";

export function SettingsPage() {
  const { settings, fetchSettings, updateSettings, setTheme } = useSettingsStore();

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  if (!settings) return null;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Settings</h1>

      {/* Appearance */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Appearance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Theme</p>
              <p className="text-xs text-muted-foreground">Switch between light and dark mode</p>
            </div>
            <Select value={settings.theme} onValueChange={(v) => setTheme(v as Theme)}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
                <SelectItem value="system">System</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* General */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">General</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Auto Start</p>
              <p className="text-xs text-muted-foreground">Launch Calamity at login</p>
            </div>
            <Switch
              checked={settings.autoStart}
              onCheckedChange={(v) => updateSettings({ autoStart: v })}
            />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">System Proxy</p>
              <p className="text-xs text-muted-foreground">Set as system HTTP/SOCKS proxy</p>
            </div>
            <Switch
              checked={settings.systemProxy}
              onCheckedChange={(v) => updateSettings({ systemProxy: v })}
            />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Allow LAN</p>
              <p className="text-xs text-muted-foreground">Allow connections from other devices on LAN</p>
            </div>
            <Switch
              checked={settings.allowLan}
              onCheckedChange={(v) => updateSettings({ allowLan: v })}
            />
          </div>
        </CardContent>
      </Card>

      {/* Ports */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Ports</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">HTTP Port</p>
            <Input
              type="number"
              className="w-24 text-right"
              value={settings.httpPort}
              onChange={(e) => updateSettings({ httpPort: parseInt(e.target.value) || 0 })}
            />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">SOCKS Port</p>
            <Input
              type="number"
              className="w-24 text-right"
              value={settings.socksPort}
              onChange={(e) => updateSettings({ socksPort: parseInt(e.target.value) || 0 })}
            />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Mixed Port</p>
            <Input
              type="number"
              className="w-24 text-right"
              value={settings.mixedPort}
              onChange={(e) => updateSettings({ mixedPort: parseInt(e.target.value) || 0 })}
            />
          </div>
        </CardContent>
      </Card>

      {/* SingBox Core */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">SingBox Core</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Core Path</p>
            <Input
              className="w-64 text-right font-mono text-xs"
              value={settings.singboxPath}
              onChange={(e) => updateSettings({ singboxPath: e.target.value })}
            />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Log Level</p>
            <Select
              value={settings.logLevel}
              onValueChange={(v) => updateSettings({ logLevel: v as LogLevel })}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="debug">Debug</SelectItem>
                <SelectItem value="info">Info</SelectItem>
                <SelectItem value="warn">Warning</SelectItem>
                <SelectItem value="error">Error</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Verify Settings page**

```bash
npm run dev
```

Expected: Settings page with theme toggle (actually switches light/dark mode), toggles, port inputs.

- [ ] **Step 3: Commit**

```bash
git add src/pages/SettingsPage.tsx && git commit -m "feat: implement Settings page with theme, ports, and core config"
```

---

### Task 12: Tray Popup Window

**Files:**
- Create: `src/tray.tsx`, `src/TrayApp.tsx`, `src/tray/TrayStatus.tsx`, `src/tray/TrayModeSwitch.tsx`, `src/tray/TraySiteRule.tsx`, `src/tray/TrayActions.tsx`
- Create: `tray.html`
- Modify: `src-tauri/src/lib.rs`, `src-tauri/tauri.conf.json`

- [ ] **Step 1: Create tray HTML entry point**

Create `tray.html` at project root (next to `index.html`):

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Calamity Tray</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/tray.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Create tray entry and root component**

Create `src/tray.tsx`:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { TrayApp } from "./TrayApp";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <TrayApp />
  </React.StrictMode>
);
```

Create `src/TrayApp.tsx`:

```tsx
import { useEffect } from "react";
import { TrayStatus } from "./tray/TrayStatus";
import { TrayModeSwitch } from "./tray/TrayModeSwitch";
import { TraySiteRule } from "./tray/TraySiteRule";
import { TrayActions } from "./tray/TrayActions";
import { Separator } from "@/components/ui/separator";
import { useConnectionStore } from "@/stores/connection";
import { useSettingsStore } from "@/stores/settings";

export function TrayApp() {
  const fetchState = useConnectionStore((s) => s.fetchState);
  const fetchSettings = useSettingsStore((s) => s.fetchSettings);

  useEffect(() => {
    fetchState();
    fetchSettings();
  }, [fetchState, fetchSettings]);

  return (
    <div className="w-72 rounded-xl border border-border bg-background/95 p-3 backdrop-blur-xl shadow-lg space-y-2">
      <TrayStatus />
      <Separator />
      <TrayModeSwitch />
      <Separator />
      <TraySiteRule />
      <Separator />
      <TrayActions />
    </div>
  );
}
```

- [ ] **Step 3: Create TrayStatus component**

Create `src/tray/TrayStatus.tsx`:

```tsx
import { ArrowUp, ArrowDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useConnectionStore } from "@/stores/connection";

function formatSpeed(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB/s`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB/s`;
}

export function TrayStatus() {
  const { status, activeNode, uploadSpeed, downloadSpeed, latency } = useConnectionStore();
  const isConnected = status === "connected";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${isConnected ? "bg-green-500" : "bg-muted-foreground/40"}`} />
          <span className="text-sm font-medium">{isConnected ? "Connected" : "Disconnected"}</span>
        </div>
        {isConnected && (
          <Badge variant="outline" className="text-[10px]">{latency}ms</Badge>
        )}
      </div>
      {isConnected && activeNode && (
        <p className="text-xs text-muted-foreground">{activeNode}</p>
      )}
      {isConnected && (
        <div className="flex gap-4 text-xs">
          <span className="flex items-center gap-1 text-muted-foreground">
            <ArrowUp className="h-3 w-3" /> {formatSpeed(uploadSpeed)}
          </span>
          <span className="flex items-center gap-1 text-muted-foreground">
            <ArrowDown className="h-3 w-3" /> {formatSpeed(downloadSpeed)}
          </span>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Create TrayModeSwitch component**

Create `src/tray/TrayModeSwitch.tsx`:

```tsx
import { useConnectionStore } from "@/stores/connection";
import type { ProxyMode } from "@/services/types";
import { cn } from "@/lib/utils";

const modes: { value: ProxyMode; label: string }[] = [
  { value: "rule", label: "Rule" },
  { value: "global", label: "Global" },
  { value: "direct", label: "Direct" },
];

export function TrayModeSwitch() {
  const { mode, setMode } = useConnectionStore();

  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
        Proxy Mode
      </p>
      <div className="flex gap-1 rounded-lg bg-muted p-0.5">
        {modes.map((m) => (
          <button
            key={m.value}
            onClick={() => setMode(m.value)}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              mode === m.value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {m.label}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create TraySiteRule component**

Create `src/tray/TraySiteRule.tsx`:

```tsx
import { useState } from "react";
import { Globe } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { OutboundType } from "@/services/types";
import { cn } from "@/lib/utils";

const outboundOptions: { value: OutboundType; label: string }[] = [
  { value: "proxy", label: "Proxy" },
  { value: "direct", label: "Direct" },
  { value: "reject", label: "Reject" },
];

export function TraySiteRule() {
  const [currentSite] = useState("github.com");
  const [currentOutbound, setCurrentOutbound] = useState<OutboundType>("proxy");

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
        Current Site
      </p>
      <div className="flex items-center gap-2">
        <Globe className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-mono truncate">{currentSite}</span>
      </div>
      <div className="flex gap-1">
        {outboundOptions.map((opt) => (
          <Badge
            key={opt.value}
            variant={currentOutbound === opt.value ? "default" : "outline"}
            className={cn("cursor-pointer text-[10px]")}
            onClick={() => setCurrentOutbound(opt.value)}
          >
            {opt.label}
          </Badge>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Create TrayActions component**

Create `src/tray/TrayActions.tsx`:

```tsx
import { Shield, Copy, ExternalLink, Power } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useSettingsStore } from "@/stores/settings";
import { useConnectionStore } from "@/stores/connection";

export function TrayActions() {
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const toggleConnection = useConnectionStore((s) => s.toggleConnection);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between py-1">
        <div className="flex items-center gap-2 text-xs">
          <Shield className="h-3.5 w-3.5" />
          <span>System Proxy</span>
        </div>
        <Switch
          className="scale-75"
          checked={settings?.systemProxy ?? false}
          onCheckedChange={(v) => updateSettings({ systemProxy: v })}
        />
      </div>
      <button className="flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
        <Copy className="h-3.5 w-3.5" />
        Copy Proxy Address
      </button>
      <button className="flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
        <ExternalLink className="h-3.5 w-3.5" />
        Open Dashboard
      </button>
      <button
        onClick={toggleConnection}
        className="flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-xs text-destructive hover:bg-destructive/10 transition-colors"
      >
        <Power className="h-3.5 w-3.5" />
        Disconnect
      </button>
    </div>
  );
}
```

- [ ] **Step 7: Add tray.html to Vite config as multi-page**

Update `vite.config.ts` to include the tray entry:

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "index.html"),
        tray: path.resolve(__dirname, "tray.html"),
      },
    },
  },
}));
```

- [ ] **Step 8: Update Tauri config for tray window**

Add tray window to `src-tauri/tauri.conf.json` windows array:

```json
{
  "label": "tray",
  "title": "Calamity Tray",
  "url": "/tray.html",
  "width": 288,
  "height": 420,
  "resizable": false,
  "decorations": false,
  "visible": false,
  "alwaysOnTop": true,
  "skipTaskbar": true
}
```

- [ ] **Step 9: Verify tray popup renders in browser**

```bash
npm run dev
# Visit http://localhost:1420/tray.html
```

Expected: Compact popup with status, mode switch, site rule, and actions.

- [ ] **Step 10: Commit**

```bash
git add tray.html src/tray.tsx src/TrayApp.tsx src/tray/ vite.config.ts src-tauri/ && git commit -m "feat: implement tray popup window with mode switch and site rules"
```

---

### Task 13: Tauri System Tray Setup

**Files:**
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/Cargo.toml`

- [ ] **Step 1: Add tray dependencies to Cargo.toml**

Add `tray-icon` feature to tauri dependency in `src-tauri/Cargo.toml`:

```toml
[dependencies]
tauri = { version = "2", features = ["tray-icon"] }
```

- [ ] **Step 2: Set up system tray in lib.rs**

Update `src-tauri/src/lib.rs`:

```rust
use tauri::{
    tray::TrayIconBuilder, Manager, PhysicalPosition, PhysicalSize,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri::plugin::init())
        .setup(|app| {
            let _tray = TrayIconBuilder::new()
                .tooltip("Calamity")
                .on_tray_icon_event(|tray_handle, event| {
                    if let tauri::tray::TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        button_state: tauri::tray::MouseButtonState::Up,
                        position,
                        ..
                    } = event
                    {
                        let app = tray_handle.app_handle();
                        if let Some(window) = app.get_webview_window("tray") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let size = PhysicalSize::new(288, 420);
                                let pos = PhysicalPosition::new(
                                    position.x as i32 - size.width as i32 / 2,
                                    position.y as i32 - size.height as i32,
                                );
                                let _ = window.set_position(pos);
                                let _ = window.set_size(size);
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

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
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 3: Verify Tauri app compiles**

```bash
cd src-tauri && cargo check
```

Expected: Compiles without errors.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/ && git commit -m "feat: add system tray with popup window toggle"
```

---

### Task 14: Final Polish and Build Verification

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Update index.html title**

Update `<title>` in `index.html` to "Calamity".

- [ ] **Step 2: Add Inter font via index.html**

Add to `<head>` in `index.html`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
```

Do the same for `tray.html`.

- [ ] **Step 3: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Run Vite build**

```bash
npm run build
```

Expected: Both `index.html` and `tray.html` are built into `dist/`.

- [ ] **Step 5: Run Tauri dev**

```bash
npm run tauri dev
```

Expected: macOS window opens with pink sidebar, all pages navigate correctly, tray icon appears in menu bar, clicking tray shows popup.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: final polish - font, title, build verification"
```

---

## Summary

| Task | Description | Key Files |
|------|------------|-----------|
| 1 | Scaffold Tauri + React + Shadcn/ui | package.json, tailwind, index.css |
| 2 | Service types + mock data | src/services/*.ts |
| 3 | Zustand stores | src/stores/*.ts |
| 4 | App layout + sidebar + router | Sidebar.tsx, AppLayout.tsx, App.tsx |
| 5 | Dashboard page | DashboardPage.tsx |
| 6 | Nodes page | NodesPage.tsx |
| 7 | Rules page (drag-and-drop) | RulesPage.tsx |
| 8 | Logs page (real-time) | LogsPage.tsx |
| 9 | Tailnet page | TailnetPage.tsx |
| 10 | DNS page | DnsPage.tsx |
| 11 | Settings page | SettingsPage.tsx |
| 12 | Tray popup window | tray/, TrayApp.tsx |
| 13 | Tauri system tray | lib.rs |
| 14 | Final polish + build | index.html, tray.html |
