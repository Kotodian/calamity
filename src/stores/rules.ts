import { create } from "zustand";
import { rulesService } from "../services/rules";
import type { RouteRule } from "../services/types";

interface RulesStore {
  rules: RouteRule[];
  fetchRules: () => Promise<void>;
  addRule: (rule: Omit<RouteRule, "id" | "order">) => Promise<void>;
  updateRule: (id: string, updates: Partial<RouteRule>) => Promise<void>;
  deleteRule: (id: string) => Promise<void>;
  reorderRules: (orderedIds: string[]) => Promise<void>;
}

export const useRulesStore = create<RulesStore>((set, get) => ({
  rules: [],

  async fetchRules() {
    const rules = await rulesService.getRules();
    set({ rules });
  },
  async addRule(rule) {
    await rulesService.addRule(rule);
    await get().fetchRules();
  },
  async updateRule(id, updates) {
    await rulesService.updateRule(id, updates);
    await get().fetchRules();
  },
  async deleteRule(id) {
    await rulesService.deleteRule(id);
    await get().fetchRules();
  },
  async reorderRules(orderedIds) {
    await rulesService.reorderRules(orderedIds);
    await get().fetchRules();
  },
}));
