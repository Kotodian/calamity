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
  { id: "r3", name: "China Direct", enabled: true, matchType: "geosite", matchValue: "cn", outbound: "direct", order: 2 },
  { id: "r4", name: "Ad Block", enabled: true, matchType: "geosite", matchValue: "category-ads-all", outbound: "reject", order: 3 },
  { id: "r5", name: "Home NAS", enabled: true, matchType: "domain-full", matchValue: "nas.home.arpa", outbound: "tailnet", outboundDevice: "homelab-nas", order: 4 },
  { id: "r6", name: "Streaming", enabled: false, matchType: "geosite", matchValue: "netflix", outbound: "proxy", outboundNode: "SG 01", order: 5 },
];

let nextId = 7;

export const rulesService: RulesService = {
  async getRules() {
    return mockRules.map((r) => ({ ...r })).sort((a, b) => a.order - b.order);
  },
  async addRule(rule) {
    const newRule: RouteRule = { ...rule, id: `r${nextId++}`, order: mockRules.length };
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
