import { create } from "zustand";
import { ruleSetMarketService, type RuleSetEntry } from "../services/ruleset-market";

interface RuleSetMarketStore {
  entries: RuleSetEntry[];
  loading: boolean;
  error: string | null;
  search: string;
  setSearch: (search: string) => void;
  fetchList: () => Promise<void>;
  filtered: () => RuleSetEntry[];
}

export const useRuleSetMarketStore = create<RuleSetMarketStore>((set, get) => ({
  entries: [],
  loading: false,
  error: null,
  search: "",

  setSearch(search) {
    set({ search });
  },

  async fetchList() {
    set({ loading: true, error: null });
    try {
      const entries = await ruleSetMarketService.getList();
      set({ entries });
    } catch (e) {
      set({ error: String(e) });
    } finally {
      set({ loading: false });
    }
  },

  filtered() {
    const { entries, search } = get();
    if (!search.trim()) return entries;
    const q = search.toLowerCase();
    return entries.filter((e) => e.name.toLowerCase().includes(q));
  },
}));
