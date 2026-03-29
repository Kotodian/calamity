import type { DnsConfig, DnsRule, DnsServer } from "./types";

export interface DnsService {
  getSettings(): Promise<{ config: DnsConfig; rules: DnsRule[] }>;
  updateConfig(updates: { mode?: string; final?: string; fakeIpRange?: string }): Promise<{ config: DnsConfig; rules: DnsRule[] }>;
  addServer(server: DnsServer): Promise<{ config: DnsConfig; rules: DnsRule[] }>;
  updateServer(server: DnsServer): Promise<{ config: DnsConfig; rules: DnsRule[] }>;
  deleteServer(id: string): Promise<{ config: DnsConfig; rules: DnsRule[] }>;
  addRule(rule: DnsRule): Promise<{ config: DnsConfig; rules: DnsRule[] }>;
  deleteRule(id: string): Promise<{ config: DnsConfig; rules: DnsRule[] }>;
}

// ---- Helper: split raw DnsSettings into config + rules ----

interface RawDnsSettings {
  mode: string;
  final: string;
  fakeIpRange: string;
  servers: DnsServer[];
  rules: DnsRule[];
}

function splitSettings(raw: RawDnsSettings): { config: DnsConfig; rules: DnsRule[] } {
  return {
    config: {
      mode: raw.mode as DnsConfig["mode"],
      final: raw.final,
      fakeIpRange: raw.fakeIpRange,
      servers: raw.servers,
    },
    rules: raw.rules,
  };
}

// ---- Mock Implementation ----

let mockData: RawDnsSettings = {
  mode: "redir-host",
  final: "dns-direct",
  fakeIpRange: "198.18.0.0/15",
  servers: [
    { id: "dns-proxy", name: "Cloudflare", address: "https://1.1.1.1/dns-query", enabled: false },
    { id: "dns-direct", name: "AliDNS", address: "https://dns.alidns.com/dns-query", enabled: true, domainResolver: "dns-resolver" },
    { id: "dns-resolver", name: "Bootstrap", address: "223.5.5.5", enabled: true },
    { id: "tailscale", name: "Tailscale", address: "100.100.100.100", enabled: true },
  ],
  rules: [
    { id: "cn-rule", matchType: "rule_set", matchValue: "geosite-cn", server: "dns-direct", enabled: true },
    { id: "not-cn-rule", matchType: "rule_set", matchValue: "geosite-geolocation-!cn", server: "dns-proxy", enabled: true },
    { id: "ts-rule", matchType: "domain-suffix", matchValue: ".ts.net", server: "tailscale", enabled: true },
  ],
};

let ruleId = 100;

const mockDnsService: DnsService = {
  async getSettings() {
    return splitSettings(JSON.parse(JSON.stringify(mockData)));
  },
  async updateConfig(updates) {
    if (updates.mode) mockData.mode = updates.mode;
    if (updates.final) mockData.final = updates.final;
    if (updates.fakeIpRange) mockData.fakeIpRange = updates.fakeIpRange;
    return splitSettings(JSON.parse(JSON.stringify(mockData)));
  },
  async addServer(server) {
    mockData.servers.push(server);
    return splitSettings(JSON.parse(JSON.stringify(mockData)));
  },
  async updateServer(server) {
    mockData.servers = mockData.servers.map((s) => (s.id === server.id ? server : s));
    return splitSettings(JSON.parse(JSON.stringify(mockData)));
  },
  async deleteServer(id) {
    mockData.servers = mockData.servers.filter((s) => s.id !== id);
    mockData.rules = mockData.rules.filter((r) => r.server !== id);
    return splitSettings(JSON.parse(JSON.stringify(mockData)));
  },
  async addRule(rule) {
    mockData.rules.push({ ...rule, id: `dr${ruleId++}` });
    return splitSettings(JSON.parse(JSON.stringify(mockData)));
  },
  async deleteRule(id) {
    mockData.rules = mockData.rules.filter((r) => r.id !== id);
    return splitSettings(JSON.parse(JSON.stringify(mockData)));
  },
};

// ---- Tauri Implementation ----

function createTauriDnsService(): DnsService {
  return {
    async getSettings() {
      const { invoke } = await import("@tauri-apps/api/core");
      const raw = await invoke<RawDnsSettings>("get_dns_settings");
      return splitSettings(raw);
    },
    async updateConfig(updates) {
      const { invoke } = await import("@tauri-apps/api/core");
      // Remap "final" → "finalServer" for Rust command param naming
      const params: Record<string, string | undefined> = {
        mode: updates.mode,
        finalServer: updates.final,
        fakeIpRange: updates.fakeIpRange,
      };
      const raw = await invoke<RawDnsSettings>("update_dns_config", params);
      return splitSettings(raw);
    },
    async addServer(server) {
      const { invoke } = await import("@tauri-apps/api/core");
      const raw = await invoke<RawDnsSettings>("add_dns_server", { server });
      return splitSettings(raw);
    },
    async updateServer(server) {
      const { invoke } = await import("@tauri-apps/api/core");
      const raw = await invoke<RawDnsSettings>("update_dns_server", { server });
      return splitSettings(raw);
    },
    async deleteServer(id) {
      const { invoke } = await import("@tauri-apps/api/core");
      const raw = await invoke<RawDnsSettings>("delete_dns_server", { id });
      return splitSettings(raw);
    },
    async addRule(rule) {
      const { invoke } = await import("@tauri-apps/api/core");
      const raw = await invoke<RawDnsSettings>("add_dns_rule", { rule });
      return splitSettings(raw);
    },
    async deleteRule(id) {
      const { invoke } = await import("@tauri-apps/api/core");
      const raw = await invoke<RawDnsSettings>("delete_dns_rule", { id });
      return splitSettings(raw);
    },
  };
}

// ---- Export ----

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
export const dnsService: DnsService = isTauri ? createTauriDnsService() : mockDnsService;
