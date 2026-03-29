import { create } from "zustand";
import { logsService } from "../services/logs";
import type { LogEntry, LogLevel } from "../services/types";

interface LogsStore {
  logs: LogEntry[];
  filter: LogLevel | null;
  search: string;
  autoScroll: boolean;
  fetchLogs: () => Promise<void>;
  setFilter: (level: LogLevel | null) => void;
  setSearch: (search: string) => void;
  setAutoScroll: (auto: boolean) => void;
  clearLogs: () => Promise<void>;
  subscribe: () => () => void;
  filteredLogs: () => LogEntry[];
}

export const useLogsStore = create<LogsStore>((set, get) => ({
  logs: [],
  filter: null,
  search: "",
  autoScroll: true,

  async fetchLogs() {
    const logs = await logsService.getLogs();
    set({ logs });
  },
  setFilter(level) {
    set({ filter: level });
  },
  setSearch(search) {
    set({ search });
  },
  setAutoScroll(auto) {
    set({ autoScroll: auto });
  },
  async clearLogs() {
    await logsService.clearLogs();
    set({ logs: [] });
  },
  subscribe() {
    return logsService.subscribeLogs((entry) => {
      set((state) => ({ logs: [...state.logs.slice(-499), entry] }));
    });
  },
  filteredLogs() {
    const { logs, filter, search } = get();
    return logs.filter((l) => {
      if (filter && l.level !== filter) return false;
      if (search && !l.message.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  },
}));
