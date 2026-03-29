import { create } from "zustand";
import { connectionsService, type ConnectionRecord, type ConnectionStats } from "../services/connections";

interface ConnectionsStore {
  records: ConnectionRecord[];
  stats: ConnectionStats;
  search: string;
  outboundFilter: string;
  fetchRecords: () => Promise<void>;
  fetchStats: () => Promise<void>;
  setSearch: (search: string) => void;
  setOutboundFilter: (filter: string) => void;
  clearAll: () => Promise<void>;
  closeConnection: (id: string) => Promise<void>;
  subscribe: () => () => void;
  filteredRecords: () => ConnectionRecord[];
}

export const useConnectionsStore = create<ConnectionsStore>((set, get) => ({
  records: [],
  stats: { total: 0, proxy: 0, direct: 0, reject: 0, active: 0 },
  search: "",
  outboundFilter: "all",

  async fetchRecords() {
    const records = await connectionsService.getConnections();
    set({ records });
  },
  async fetchStats() {
    const stats = await connectionsService.getStats();
    set({ stats });
  },
  setSearch(search) {
    set({ search });
  },
  setOutboundFilter(filter) {
    set({ outboundFilter: filter });
  },
  async clearAll() {
    await connectionsService.clearConnections();
    set({ records: [], stats: { total: 0, proxy: 0, direct: 0, reject: 0, active: 0 } });
  },
  async closeConnection(id) {
    await connectionsService.closeConnection(id);
    await get().fetchRecords();
    await get().fetchStats();
  },
  subscribe() {
    return connectionsService.subscribe((record) => {
      set((state) => {
        const records = [...state.records.slice(-499), record];
        const stats = {
          total: records.length,
          proxy: records.filter((r) => r.outbound === "proxy").length,
          direct: records.filter((r) => r.outbound === "direct").length,
          reject: records.filter((r) => r.outbound === "reject").length,
          active: records.filter((r) => r.status === "active").length,
        };
        return { records, stats };
      });
    });
  },
  filteredRecords() {
    const { records, search, outboundFilter } = get();
    return records.filter((r) => {
      if (outboundFilter !== "all" && r.outbound !== outboundFilter) return false;
      if (search && !r.host.toLowerCase().includes(search.toLowerCase()) &&
          !(r.process?.toLowerCase().includes(search.toLowerCase()))) return false;
      return true;
    }).reverse(); // newest first
  },
}));
