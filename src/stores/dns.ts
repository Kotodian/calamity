import { create } from "zustand";
import { dnsService } from "../services/dns";
import type { DnsConfig, DnsRule, DnsServer } from "../services/types";

interface DnsStore {
  config: DnsConfig | null;
  rules: DnsRule[];
  fetchAll: () => Promise<void>;
  updateConfig: (updates: { mode?: string; final?: string; fakeIpRange?: string }) => Promise<void>;
  addServer: (server: DnsServer) => Promise<void>;
  updateServer: (server: DnsServer) => Promise<void>;
  deleteServer: (id: string) => Promise<void>;
  addRule: (rule: DnsRule) => Promise<void>;
  deleteRule: (id: string) => Promise<void>;
}

export const useDnsStore = create<DnsStore>((set) => ({
  config: null,
  rules: [],

  async fetchAll() {
    const { config, rules } = await dnsService.getSettings();
    set({ config, rules });
  },
  async updateConfig(updates) {
    const { config, rules } = await dnsService.updateConfig(updates);
    set({ config, rules });
  },
  async addServer(server) {
    const { config, rules } = await dnsService.addServer(server);
    set({ config, rules });
  },
  async updateServer(server) {
    const { config, rules } = await dnsService.updateServer(server);
    set({ config, rules });
  },
  async deleteServer(id) {
    const { config, rules } = await dnsService.deleteServer(id);
    set({ config, rules });
  },
  async addRule(rule) {
    const { config, rules } = await dnsService.addRule(rule);
    set({ config, rules });
  },
  async deleteRule(id) {
    const { config, rules } = await dnsService.deleteRule(id);
    set({ config, rules });
  },
}));
