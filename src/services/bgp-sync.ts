import type { RouteRule } from "./types";

export interface BgpPeer {
  id: string;
  name: string;
  address: string;
  autoDiscovered: boolean;
}

export interface BgpSettings {
  enabled: boolean;
  peers: BgpPeer[];
}

export interface RuleDiffEntry {
  local: RouteRule;
  remote: RouteRule;
}

export interface RuleDiff {
  added: RouteRule[];
  removed: RouteRule[];
  modified: RuleDiffEntry[];
  finalOutboundChanged: boolean;
  newFinalOutbound: string;
  newFinalOutboundNode?: string;
  remoteRules: {
    rules: RouteRule[];
    finalOutbound: string;
    finalOutboundNode?: string;
    updateInterval: number;
  };
}

export interface DiscoveredPeer {
  name: string;
  address: string;
  source: "mdns" | "tailscale";
}

export type SyncStatus = "disconnected" | "connecting" | "synced" | { reconnecting: { attempt: number } };

export interface BgpSyncService {
  getSettings(): Promise<BgpSettings>;
  setEnabled(enabled: boolean): Promise<void>;
  addPeer(name: string, address: string): Promise<BgpSettings>;
  removePeer(id: string): Promise<BgpSettings>;
  pullRules(peerId: string): Promise<RuleDiff>;
  applyRules(remoteRules: RuleDiff["remoteRules"]): Promise<void>;
  discoverPeers(): Promise<DiscoveredPeer[]>;
  startSync(peerId: string): Promise<void>;
  stopSync(): Promise<void>;
  getSyncStatus(): Promise<SyncStatus>;
}

const mockBgpSyncService: BgpSyncService = {
  async getSettings() {
    return { enabled: false, peers: [] };
  },
  async setEnabled() {},
  async addPeer(name, address) {
    return {
      enabled: true,
      peers: [{ id: "mock-1", name, address, autoDiscovered: false }],
    };
  },
  async removePeer() {
    return { enabled: true, peers: [] };
  },
  async pullRules() {
    return {
      added: [],
      removed: [],
      modified: [],
      finalOutboundChanged: false,
      newFinalOutbound: "proxy",
      remoteRules: { rules: [], finalOutbound: "proxy", updateInterval: 86400 },
    };
  },
  async applyRules() {},
  async discoverPeers() {
    return [];
  },
  async startSync() {},
  async stopSync() {},
  async getSyncStatus() {
    return "disconnected" as SyncStatus;
  },
};

function createTauriBgpSyncService(): BgpSyncService {
  return {
    async getSettings() {
      const { invoke } = await import("@tauri-apps/api/core");
      return invoke<BgpSettings>("bgp_get_settings");
    },
    async setEnabled(enabled) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("bgp_set_enabled", { enabled });
    },
    async addPeer(name, address) {
      const { invoke } = await import("@tauri-apps/api/core");
      return invoke<BgpSettings>("bgp_add_peer", { name, address });
    },
    async removePeer(id) {
      const { invoke } = await import("@tauri-apps/api/core");
      return invoke<BgpSettings>("bgp_remove_peer", { id });
    },
    async pullRules(peerId) {
      const { invoke } = await import("@tauri-apps/api/core");
      return invoke<RuleDiff>("bgp_pull_rules", { peerId });
    },
    async applyRules(remoteRules) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("bgp_apply_rules", { remoteRules });
    },
    async discoverPeers() {
      const { invoke } = await import("@tauri-apps/api/core");
      return invoke<DiscoveredPeer[]>("bgp_discover_peers");
    },
    async startSync(peerId) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("bgp_start_sync", { peerId });
    },
    async stopSync() {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("bgp_stop_sync");
    },
    async getSyncStatus() {
      const { invoke } = await import("@tauri-apps/api/core");
      return invoke<SyncStatus>("bgp_sync_status");
    },
  };
}

const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
export const bgpSyncService: BgpSyncService = isTauri
  ? createTauriBgpSyncService()
  : mockBgpSyncService;
