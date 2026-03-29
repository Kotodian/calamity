import type { RouteRule } from "./types";

export interface RulesService {
  getRules(): Promise<RouteRule[]>;
  addRule(rule: Omit<RouteRule, "id" | "order">): Promise<RouteRule>;
  updateRule(id: string, updates: Partial<RouteRule>): Promise<void>;
  deleteRule(id: string): Promise<void>;
  reorderRules(orderedIds: string[]): Promise<void>;
}

let mockRules: RouteRule[] = [
  { id: "r1", name: "Google Services", enabled: true, matchType: "domain-suffix", matchValue: "google.com", outbound: "proxy", outboundNode: "Tokyo 01", order: 0 },
  { id: "r2", name: "GitHub", enabled: true, matchType: "domain-suffix", matchValue: "github.com", outbound: "proxy", outboundNode: "US West", order: 1 },
  { id: "r3", name: "China Direct", enabled: true, matchType: "geosite", matchValue: "cn", outbound: "direct", order: 2, ruleSetUrl: "https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-cn.srs", downloadDetour: "direct" },
  { id: "r4", name: "Ad Block", enabled: true, matchType: "geosite", matchValue: "category-ads-all", outbound: "reject", order: 3, ruleSetUrl: "https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-category-ads-all.srs", downloadDetour: "direct" },
  { id: "r5", name: "Home NAS", enabled: true, matchType: "domain-full", matchValue: "nas.home.arpa", outbound: "tailnet", outboundDevice: "homelab-nas", order: 4 },
  { id: "r6", name: "Streaming", enabled: false, matchType: "geosite", matchValue: "netflix", outbound: "proxy", outboundNode: "SG 01", order: 5 },
  { id: "r7", name: "Torrent Direct", enabled: true, matchType: "process-name", matchValue: "qbittorrent", outbound: "direct", order: 6 },
  { id: "r8", name: "Chrome Proxy", enabled: true, matchType: "process-path", matchValue: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", outbound: "proxy", outboundNode: "Tokyo 01", order: 7 },
];

let nextId = 9;

export const rulesService: RulesService = {
  async getRules() {
    return mockRules.map((r) => ({ ...r })).sort((a, b) => a.order - b.order);
  },
  async addRule(rule) {
    const newRule: RouteRule = { ...rule, id: `r${nextId++}`, order: mockRules.length };
    // Auto-populate ruleSetUrl for geo types if not provided
    if (newRule.matchType === "geosite" && !newRule.ruleSetUrl) {
      newRule.ruleSetUrl = `https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-${newRule.matchValue}.srs`;
    }
    if (newRule.matchType === "geoip" && !newRule.ruleSetUrl) {
      newRule.ruleSetUrl = `https://raw.githubusercontent.com/SagerNet/sing-geoip/rule-set/geoip-${newRule.matchValue}.srs`;
    }
    mockRules.push(newRule);
    return { ...newRule };
  },
  async updateRule(id, updates) {
    mockRules = mockRules.map((r) => (r.id === id ? { ...r, ...updates } : r));
  },
  async deleteRule(id) {
    mockRules = mockRules.filter((r) => r.id !== id);
  },
  async reorderRules(orderedIds) {
    mockRules = orderedIds.map((id, i) => {
      const rule = mockRules.find((r) => r.id === id)!;
      return { ...rule, order: i };
    });
  },
};
