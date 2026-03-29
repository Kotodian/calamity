export interface Subscription {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  nodeCount: number;
  lastUpdated: string;
  autoUpdateInterval: number; // seconds, 0 = never
  trafficUsed: number;  // bytes (upload + download)
  trafficTotal: number; // bytes, 0 = unlimited
  expire: string | null; // ISO date string
  status: "active" | "updating" | "error";
}

export interface SubscriptionsService {
  getSubscriptions(): Promise<Subscription[]>;
  addSubscription(input: { name: string; url: string; autoUpdateInterval?: number }): Promise<Subscription>;
  removeSubscription(id: string): Promise<void>;
  updateSubscription(id: string): Promise<Subscription>;
  updateAllSubscriptions(): Promise<void>;
  toggleSubscription(id: string, enabled: boolean): Promise<void>;
  editSubscription(id: string, updates: { name?: string; url?: string; autoUpdateInterval?: number }): Promise<void>;
}

// ---- Mock Implementation ----

let mockSubs: Subscription[] = [
  {
    id: "sub-1",
    name: "Global High-Speed",
    url: "https://provider1.example.com/api/v1/client/subscribe?token=abc123def456",
    enabled: true,
    nodeCount: 128,
    lastUpdated: new Date(Date.now() - 300000).toISOString(),
    autoUpdateInterval: 43200,
    trafficUsed: 42.5 * 1024 * 1024 * 1024,
    trafficTotal: 1024 * 1024 * 1024 * 1024,
    expire: new Date(Date.now() + 30 * 86400000).toISOString(),
    status: "active",
  },
  {
    id: "sub-2",
    name: "Asia Premium",
    url: "https://provider2.example.com/sub/clash?token=xyz789",
    enabled: true,
    nodeCount: 24,
    lastUpdated: new Date(Date.now() - 3600000).toISOString(),
    autoUpdateInterval: 21600,
    trafficUsed: 8.2 * 1024 * 1024 * 1024,
    trafficTotal: 50 * 1024 * 1024 * 1024,
    expire: null,
    status: "active",
  },
];

let nextId = 4;

const mockSubscriptionsService: SubscriptionsService = {
  async getSubscriptions() {
    return mockSubs.map((s) => ({ ...s }));
  },
  async addSubscription(input) {
    const sub: Subscription = {
      id: `sub-${nextId++}`,
      name: input.name,
      url: input.url,
      enabled: true,
      nodeCount: Math.floor(Math.random() * 50) + 5,
      lastUpdated: new Date().toISOString(),
      autoUpdateInterval: input.autoUpdateInterval ?? 43200,
      trafficUsed: 0,
      trafficTotal: 0,
      expire: null,
      status: "active",
    };
    mockSubs.push(sub);
    return { ...sub };
  },
  async removeSubscription(id) {
    mockSubs = mockSubs.filter((s) => s.id !== id);
  },
  async updateSubscription(id) {
    const sub = mockSubs.find((s) => s.id === id);
    if (sub) {
      sub.lastUpdated = new Date().toISOString();
      sub.nodeCount = Math.floor(Math.random() * 50) + 5;
    }
    return { ...sub! };
  },
  async updateAllSubscriptions() {
    for (const sub of mockSubs) {
      if (sub.enabled) {
        sub.lastUpdated = new Date().toISOString();
      }
    }
  },
  async toggleSubscription(id, enabled) {
    const sub = mockSubs.find((s) => s.id === id);
    if (sub) sub.enabled = enabled;
  },
  async editSubscription(id, updates) {
    const sub = mockSubs.find((s) => s.id === id);
    if (sub) {
      if (updates.name !== undefined) sub.name = updates.name;
      if (updates.url !== undefined) sub.url = updates.url;
      if (updates.autoUpdateInterval !== undefined) sub.autoUpdateInterval = updates.autoUpdateInterval;
    }
  },
};

// ---- Tauri Implementation ----

interface RawSubscriptionConfig {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  autoUpdateInterval: number;
  lastUpdated: string | null;
  nodeCount: number;
  groupId: string;
  trafficUpload: number;
  trafficDownload: number;
  trafficTotal: number;
  expire: string | null;
}

interface RawSubscriptionsData {
  subscriptions: RawSubscriptionConfig[];
}

function toSubscription(raw: RawSubscriptionConfig): Subscription {
  return {
    id: raw.id,
    name: raw.name,
    url: raw.url,
    enabled: raw.enabled,
    nodeCount: raw.nodeCount,
    lastUpdated: raw.lastUpdated ?? new Date().toISOString(),
    autoUpdateInterval: raw.autoUpdateInterval,
    trafficUsed: raw.trafficUpload + raw.trafficDownload,
    trafficTotal: raw.trafficTotal,
    expire: raw.expire,
    status: "active",
  };
}

function createTauriSubscriptionsService(): SubscriptionsService {
  return {
    async getSubscriptions() {
      const { invoke } = await import("@tauri-apps/api/core");
      const raw = await invoke<RawSubscriptionsData>("get_subscriptions");
      return raw.subscriptions.map(toSubscription);
    },
    async addSubscription(input) {
      const { invoke } = await import("@tauri-apps/api/core");
      const raw = await invoke<RawSubscriptionConfig>("add_subscription", {
        name: input.name,
        url: input.url,
        autoUpdateInterval: input.autoUpdateInterval ?? null,
      });
      return toSubscription(raw);
    },
    async removeSubscription(id) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("delete_subscription", { id });
    },
    async updateSubscription(id) {
      const { invoke } = await import("@tauri-apps/api/core");
      const raw = await invoke<RawSubscriptionConfig>("update_subscription", { id });
      return toSubscription(raw);
    },
    async updateAllSubscriptions() {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("update_all_subscriptions");
    },
    async toggleSubscription(id, enabled) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("toggle_subscription", { id, enabled });
    },
    async editSubscription(id, updates) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("edit_subscription", {
        id,
        name: updates.name ?? null,
        url: updates.url ?? null,
        autoUpdateInterval: updates.autoUpdateInterval ?? null,
      });
    },
  };
}

// ---- Export ----

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
export const subscriptionsService: SubscriptionsService = isTauri
  ? createTauriSubscriptionsService()
  : mockSubscriptionsService;
