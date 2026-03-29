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
  subscribe(callback: (record: ConnectionRecord) => void): () => void;
  closeConnection(id: string): Promise<void>;
}

const sampleHosts = [
  { host: "www.google.com", rule: "GeoSite:google", outbound: "proxy", node: "HK-Premium-01" },
  { host: "api.github.com", rule: "GeoSite:github", outbound: "proxy", node: "US-East-Proxy" },
  { host: "cdn.jsdelivr.net", rule: "GeoSite:jsdelivr", outbound: "proxy", node: "SG-01" },
  { host: "www.baidu.com", rule: "GeoSite:cn", outbound: "direct", node: "Direct" },
  { host: "ads.tracking.com", rule: "AdBlock", outbound: "reject", node: "Reject" },
  { host: "192.168.1.1", rule: "Local", outbound: "direct", node: "Direct" },
  { host: "play.google.com", rule: "GeoSite:google", outbound: "proxy", node: "HK-Premium-01" },
  { host: "raw.githubusercontent.com", rule: "Global-Rule", outbound: "proxy", node: "Tokyo-01" },
  { host: "www.bilibili.com", rule: "GeoSite:bilibili", outbound: "direct", node: "Direct" },
  { host: "analytics.tiktok.com", rule: "AdBlock", outbound: "reject", node: "Reject" },
  { host: "api.openai.com", rule: "GeoSite:openai", outbound: "proxy", node: "US-East-Proxy" },
  { host: "registry.npmjs.org", rule: "Global-Rule", outbound: "proxy", node: "Tokyo-01" },
];

const processes = ["Google Chrome", "Safari", "curl", "node", "git", "Code", "Slack", undefined];

let mockRecords: ConnectionRecord[] = [];
let recordId = 0;

function generateRecord(): ConnectionRecord {
  const sample = sampleHosts[Math.floor(Math.random() * sampleHosts.length)];
  const process = processes[Math.floor(Math.random() * processes.length)];
  return {
    id: `conn-${recordId++}`,
    timestamp: new Date().toISOString(),
    host: sample.host,
    destinationIp: `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
    port: [80, 443, 8080, 8443][Math.floor(Math.random() * 4)],
    network: Math.random() > 0.2 ? "tcp" : "udp",
    matchedRule: sample.rule,
    outbound: sample.outbound,
    outboundNode: sample.node,
    duration: Math.floor(Math.random() * 300) + 5,
    upload: Math.floor(Math.random() * 10000),
    download: Math.floor(Math.random() * 100000),
    process,
    status: Math.random() > 0.3 ? "closed" : "active",
  };
}

// Pre-populate
for (let i = 0; i < 30; i++) {
  mockRecords.push(generateRecord());
}

export const connectionsService: ConnectionsService = {
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
      callback(record);
    }, 1000);
    return () => clearInterval(interval);
  },
  async closeConnection(id) {
    const r = mockRecords.find((r) => r.id === id);
    if (r) r.status = "closed";
  },
};
