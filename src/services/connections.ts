export interface ConnectionRecord {
  id: string;
  timestamp: string;
  host: string;
  destinationIp: string;
  port: number;
  network: "tcp" | "udp";
  matchedRule: string;
  outbound: string;
  outboundNode: string;
  duration: number; // ms
  upload: number;   // bytes
  download: number; // bytes
  process?: string;
  processPath?: string;
  status: "active" | "closed";
}

export interface ConnectionStats {
  total: number;
  proxy: number;
  direct: number;
  reject: number;
  active: number;
}

export interface ConnectionsService {
  getConnections(): Promise<ConnectionRecord[]>;
  getStats(): Promise<ConnectionStats>;
  clearConnections(): Promise<void>;
  subscribe(callback: (records: ConnectionRecord[]) => void): () => void;
  closeConnection(id: string): Promise<void>;
}

// ---- Mock Implementation ----

const sampleHosts = [
  { host: "www.google.com", rule: "GeoSite:google", outbound: "proxy", node: "HK-Premium-01" },
  { host: "api.github.com", rule: "GeoSite:github", outbound: "proxy", node: "US-East-Proxy" },
  { host: "cdn.jsdelivr.net", rule: "GeoSite:jsdelivr", outbound: "proxy", node: "SG-01" },
  { host: "www.baidu.com", rule: "GeoSite:cn", outbound: "direct", node: "Direct" },
  { host: "ads.tracking.com", rule: "AdBlock", outbound: "reject", node: "Reject" },
  { host: "192.168.1.1", rule: "Local", outbound: "direct", node: "Direct" },
];

const processes: (readonly [string, string] | undefined)[] = [
  ["Google Chrome", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"],
  ["Safari", "/Applications/Safari.app/Contents/MacOS/Safari"],
  ["curl", "/usr/bin/curl"],
  ["node", "/usr/local/bin/node"],
  ["git", "/usr/bin/git"],
  undefined,
];

let mockRecords: ConnectionRecord[] = [];
let recordId = 0;

function generateRecord(): ConnectionRecord {
  const sample = sampleHosts[Math.floor(Math.random() * sampleHosts.length)];
  const processEntry = processes[Math.floor(Math.random() * processes.length)];
  const process = processEntry?.[0];
  const processPath = processEntry?.[1];
  return {
    id: `conn-${recordId++}`,
    timestamp: new Date().toISOString(),
    host: sample.host,
    destinationIp: `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
    port: [80, 443, 8080][Math.floor(Math.random() * 3)],
    network: Math.random() > 0.2 ? "tcp" : "udp",
    matchedRule: sample.rule,
    outbound: sample.outbound,
    outboundNode: sample.node,
    duration: Math.floor(Math.random() * 300) + 5,
    upload: Math.floor(Math.random() * 10000),
    download: Math.floor(Math.random() * 100000),
    process,
    processPath,
    status: Math.random() > 0.3 ? "closed" : "active",
  };
}

for (let i = 0; i < 30; i++) {
  mockRecords.push(generateRecord());
}

const mockConnectionsService: ConnectionsService = {
  async getConnections() {
    return mockRecords.map((r) => ({ ...r }));
  },
  async getStats() {
    return {
      total: mockRecords.length,
      proxy: mockRecords.filter((r) => r.outbound === "proxy").length,
      direct: mockRecords.filter((r) => r.outbound === "direct").length,
      reject: mockRecords.filter((r) => r.outbound === "reject").length,
      active: mockRecords.filter((r) => r.status === "active").length,
    };
  },
  async clearConnections() {
    mockRecords = [];
  },
  subscribe(callback) {
    const interval = setInterval(() => {
      const record = generateRecord();
      mockRecords.push(record);
      if (mockRecords.length > 500) mockRecords = mockRecords.slice(-500);
      callback([...mockRecords]);
    }, 1000);
    return () => clearInterval(interval);
  },
  async closeConnection(id) {
    const r = mockRecords.find((r) => r.id === id);
    if (r) r.status = "closed";
  },
};

// ---- Tauri Implementation ----

interface RawConnection {
  id: string;
  metadata: {
    host: string;
    destinationIP: string;
    destinationPort: string;
    sourceIP: string;
    sourcePort: string;
    network: string;
    type: string;
    processPath: string;
    dnsMode: string;
  };
  upload: number;
  download: number;
  start: string;
  chains: string[];
  rule: string;
  rulePayload: string;
}

interface RawConnectionsSnapshot {
  connections: RawConnection[] | null;
  uploadTotal: number;
  downloadTotal: number;
  memory: number;
}

function mapConnection(raw: RawConnection): ConnectionRecord {
  const startTime = new Date(raw.start).getTime();
  const duration = Date.now() - startTime;

  // Parse outbound type from rule string: "rule_set=geosite-cn => route(direct-out)" or "final => route(node-name)"
  let outbound = "proxy";
  const chains = raw.chains ?? [];
  const firstChain = chains[0] ?? "";
  if (firstChain === "direct-out" || firstChain.toLowerCase() === "direct") {
    outbound = "direct";
  } else if (firstChain === "block-out" || firstChain.toLowerCase() === "reject") {
    outbound = "reject";
  }

  // Extract process name from processPath — strip trailing " (username)" suffix
  const rawProcessPath = raw.metadata.processPath ?? "";
  const processPath = rawProcessPath.replace(/\s+\([^)]+\)$/, "");
  const process = processPath ? processPath.split("/").pop() : undefined;

  return {
    id: raw.id,
    timestamp: raw.start,
    host: raw.metadata.host || raw.metadata.destinationIP || "unknown",
    destinationIp: raw.metadata.destinationIP || "",
    port: parseInt(raw.metadata.destinationPort, 10) || 0,
    network: (raw.metadata.network as "tcp" | "udp") || "tcp",
    matchedRule: raw.rule || "final",
    outbound,
    outboundNode: firstChain || "direct-out",
    duration: Math.max(0, duration),
    upload: raw.upload ?? 0,
    download: raw.download ?? 0,
    process,
    processPath: processPath || undefined,
    status: "active",
  };
}

function createTauriConnectionsService(): ConnectionsService {
  return {
    async getConnections() {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke<RawConnectionsSnapshot>("get_dashboard_info");
      // get_dashboard_info doesn't return full connections, use subscribe instead
      return [];
    },
    async getStats() {
      return { total: 0, proxy: 0, direct: 0, reject: 0, active: 0 };
    },
    async clearConnections() {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("close_all_connections");
    },
    subscribe(callback) {
      let unlisten: (() => void) | null = null;

      (async () => {
        const { listen } = await import("@tauri-apps/api/event");
        const { invoke } = await import("@tauri-apps/api/core");

        unlisten = await listen<RawConnectionsSnapshot>("connections-update", (event) => {
          const raw = event.payload;
          const connections = (raw.connections ?? []).map(mapConnection);
          callback(connections);
        });

        // Start the subscription
        await invoke("subscribe_connections").catch(() => {});
      })();

      return () => {
        if (unlisten) unlisten();
      };
    },
    async closeConnection(id) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("close_connection", { id });
    },
  };
}

// ---- Export ----

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
export const connectionsService: ConnectionsService = isTauri ? createTauriConnectionsService() : mockConnectionsService;
