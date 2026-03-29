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

let mockCache: DnsCacheEntry[] = [
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
    mockCache = [];
  },
};
