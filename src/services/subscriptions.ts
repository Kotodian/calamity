export type AutoUpdateInterval = "1h" | "6h" | "12h" | "24h" | "never";

export interface Subscription {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  nodeCount: number;
  lastUpdated: string;
  autoUpdateInterval: AutoUpdateInterval;
  trafficUsed: number;  // bytes
  trafficTotal: number; // bytes, 0 = unlimited
  status: "active" | "updating" | "error";
}

export interface SubscriptionsService {
  getSubscriptions(): Promise<Subscription[]>;
  addSubscription(input: { name: string; url: string }): Promise<Subscription>;
  removeSubscription(id: string): Promise<void>;
  updateSubscription(id: string): Promise<void>;
  toggleSubscription(id: string, enabled: boolean): Promise<void>;
  setAutoUpdateInterval(id: string, interval: AutoUpdateInterval): Promise<void>;
}

let mockSubs: Subscription[] = [
  {
    id: "sub-1",
    name: "Global High-Speed",
    url: "https://provider1.example.com/api/v1/client/subscribe?token=abc123def456",
    enabled: true,
    nodeCount: 128,
    lastUpdated: new Date(Date.now() - 300000).toISOString(),
    autoUpdateInterval: "12h",
    trafficUsed: 42.5 * 1024 * 1024 * 1024,
    trafficTotal: 1024 * 1024 * 1024 * 1024,
    status: "active",
  },
  {
    id: "sub-2",
    name: "Asia Premium",
    url: "https://provider2.example.com/sub/clash?token=xyz789",
    enabled: true,
    nodeCount: 24,
    lastUpdated: new Date(Date.now() - 3600000).toISOString(),
    autoUpdateInterval: "6h",
    trafficUsed: 8.2 * 1024 * 1024 * 1024,
    trafficTotal: 50 * 1024 * 1024 * 1024,
    status: "active",
  },
  {
    id: "sub-3",
    name: "Backup Nodes",
    url: "https://backup.example.com/singbox/sub",
    enabled: false,
    nodeCount: 12,
    lastUpdated: new Date(Date.now() - 86400000).toISOString(),
    autoUpdateInterval: "24h",
    trafficUsed: 0,
    trafficTotal: 0,
    status: "active",
  },
];

let nextId = 4;

export const subscriptionsService: SubscriptionsService = {
  async getSubscriptions() {
    return mockSubs.map((s) => ({ ...s }));
  },
  async addSubscription(input) {
    const sub: Subscription = {
      id: `sub-${nextId++}`,
      name: input.name,
      url: input.url,
      enabled: true,
      nodeCount: 0,
      lastUpdated: new Date().toISOString(),
      autoUpdateInterval: "12h",
      trafficUsed: 0,
      trafficTotal: 0,
      status: "updating",
    };
    mockSubs.push(sub);
    // Simulate fetch
    setTimeout(() => {
      sub.nodeCount = Math.floor(Math.random() * 50) + 5;
      sub.status = "active";
    }, 500);
    return { ...sub };
  },
  async removeSubscription(id) {
    mockSubs = mockSubs.filter((s) => s.id !== id);
  },
  async updateSubscription(id) {
    const sub = mockSubs.find((s) => s.id === id);
    if (sub) {
      sub.status = "updating";
      sub.lastUpdated = new Date().toISOString();
      sub.nodeCount = Math.floor(Math.random() * 50) + 5;
      sub.status = "active";
    }
  },
  async toggleSubscription(id, enabled) {
    const sub = mockSubs.find((s) => s.id === id);
    if (sub) sub.enabled = enabled;
  },
  async setAutoUpdateInterval(id, interval) {
    const sub = mockSubs.find((s) => s.id === id);
    if (sub) sub.autoUpdateInterval = interval;
  },
};
