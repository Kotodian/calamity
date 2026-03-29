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
