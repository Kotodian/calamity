import { create } from "zustand";
import {
  bgpSyncService,
  type BgpSettings,
  type RuleDiff,
  type DiscoveredPeer,
} from "../services/bgp-sync";

interface BgpSyncStore {
  settings: BgpSettings;
  discoveredPeers: DiscoveredPeer[];
  pullDiff: RuleDiff | null;
  pulling: boolean;
  discovering: boolean;

  fetchSettings: () => Promise<void>;
  setEnabled: (enabled: boolean) => Promise<void>;
  addPeer: (name: string, address: string) => Promise<void>;
  removePeer: (id: string) => Promise<void>;
  pullRules: (peerId: string) => Promise<void>;
  applyRules: () => Promise<void>;
  discoverPeers: () => Promise<void>;
  clearDiff: () => void;
}

export const useBgpSyncStore = create<BgpSyncStore>((set, get) => ({
  settings: { enabled: false, peers: [] },
  discoveredPeers: [],
  pullDiff: null,
  pulling: false,
  discovering: false,

  async fetchSettings() {
    const settings = await bgpSyncService.getSettings();
    set({ settings });
  },

  async setEnabled(enabled) {
    await bgpSyncService.setEnabled(enabled);
    await get().fetchSettings();
  },

  async addPeer(name, address) {
    const settings = await bgpSyncService.addPeer(name, address);
    set({ settings });
  },

  async removePeer(id) {
    const settings = await bgpSyncService.removePeer(id);
    set({ settings });
  },

  async pullRules(peerId) {
    set({ pulling: true, pullDiff: null });
    try {
      const diff = await bgpSyncService.pullRules(peerId);
      set({ pullDiff: diff });
    } finally {
      set({ pulling: false });
    }
  },

  async applyRules() {
    const diff = get().pullDiff;
    if (!diff) return;
    await bgpSyncService.applyRules(diff.remoteRules);
    set({ pullDiff: null });
  },

  async discoverPeers() {
    set({ discovering: true });
    try {
      const peers = await bgpSyncService.discoverPeers();
      set({ discoveredPeers: peers });
    } finally {
      set({ discovering: false });
    }
  },

  clearDiff() {
    set({ pullDiff: null });
  },
}));
