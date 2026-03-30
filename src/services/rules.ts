import type { RouteRule } from "./types";

export interface FinalOutbound {
  outbound: string;
  outboundNode?: string;
}

export interface RulesService {
  getRules(): Promise<RouteRule[]>;
  getFinalOutbound(): Promise<FinalOutbound>;
  updateFinalOutbound(outbound: string, outboundNode?: string): Promise<void>;
  addRule(rule: Omit<RouteRule, "id" | "order">): Promise<RouteRule>;
  updateRule(id: string, updates: Partial<RouteRule>): Promise<void>;
  deleteRule(id: string): Promise<void>;
  reorderRules(orderedIds: string[]): Promise<void>;
}

// ---- Mock Implementation ----

let mockRules: RouteRule[] = [
  { id: "r1", name: "Google Services", enabled: true, matchType: "domain-suffix", matchValue: "google.com", outbound: "proxy", outboundNode: "Tokyo 01", order: 0 },
  { id: "r2", name: "GitHub", enabled: true, matchType: "domain-suffix", matchValue: "github.com", outbound: "proxy", outboundNode: "US West", order: 1 },
  { id: "r3", name: "China Direct", enabled: true, matchType: "geosite", matchValue: "cn", outbound: "direct", order: 2, ruleSetUrl: "https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-cn.srs", downloadDetour: "direct" },
  { id: "r4", name: "Ad Block", enabled: true, matchType: "geosite", matchValue: "category-ads-all", outbound: "reject", order: 3, ruleSetUrl: "https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-category-ads-all.srs", downloadDetour: "direct" },
  { id: "r5", name: "Torrent Direct", enabled: true, matchType: "process-name", matchValue: "qbittorrent", outbound: "direct", order: 4 },
  { id: "r6", name: "Streaming", enabled: false, matchType: "geosite", matchValue: "netflix", outbound: "proxy", outboundNode: "SG 01", order: 5 },
];

let nextId = 7;

let mockFinal: FinalOutbound = { outbound: "proxy" };

const mockRulesService: RulesService = {
  async getRules() {
    return mockRules.map((r) => ({ ...r })).sort((a, b) => a.order - b.order);
  },
  async getFinalOutbound() {
    return { ...mockFinal };
  },
  async updateFinalOutbound(outbound, outboundNode) {
    mockFinal = { outbound, outboundNode };
  },
  async addRule(rule) {
    const newRule: RouteRule = { ...rule, id: `r${nextId++}`, order: mockRules.length };
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

// ---- Tauri Implementation ----

interface RawRulesData {
  rules: RouteRule[];
  finalOutbound: string;
  finalOutboundNode?: string;
  updateInterval: number;
}

function toRouteRules(raw: RawRulesData): RouteRule[] {
  return raw.rules
    .map((r) => ({ ...r }))
    .sort((a, b) => a.order - b.order);
}

function createTauriRulesService(): RulesService {
  return {
    async getRules() {
      const { invoke } = await import("@tauri-apps/api/core");
      const raw = await invoke<RawRulesData>("get_rules");
      return toRouteRules(raw);
    },
    async getFinalOutbound() {
      const { invoke } = await import("@tauri-apps/api/core");
      const raw = await invoke<RawRulesData>("get_rules");
      return { outbound: raw.finalOutbound ?? "proxy", outboundNode: raw.finalOutboundNode };
    },
    async updateFinalOutbound(outbound, outboundNode) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("update_final_outbound", { outbound, outboundNode: outboundNode ?? null });
    },
    async addRule(rule) {
      const { invoke } = await import("@tauri-apps/api/core");
      const id = `rule-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const fullRule: RouteRule = { ...rule, id, order: 0 };
      const raw = await invoke<RawRulesData>("add_rule", { rule: fullRule });
      const rules = toRouteRules(raw);
      return rules[rules.length - 1];
    },
    async updateRule(id, updates) {
      const { invoke } = await import("@tauri-apps/api/core");
      const raw = await invoke<RawRulesData>("get_rules");
      const current = raw.rules.find((r) => r.id === id);
      if (!current) throw new Error(`Rule ${id} not found`);
      const merged = { ...current, ...updates };
      await invoke("update_rule", { rule: merged });
    },
    async deleteRule(id) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("delete_rule", { id });
    },
    async reorderRules(orderedIds) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("reorder_rules", { orderedIds });
    },
  };
}

// ---- Export ----

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
export const rulesService: RulesService = isTauri ? createTauriRulesService() : mockRulesService;
