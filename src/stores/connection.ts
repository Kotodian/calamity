import { create } from "zustand";
import { toast } from "sonner";
import { connectionService } from "../services/connection";
import type { ConnectionState, ProxyMode, SpeedRecord } from "../services/types";

const MAX_HISTORY = 300; // 5 minutes at 1 point/sec

interface ConnectionStore extends ConnectionState {
  speedHistory: SpeedRecord[];
  activeConnections: number;
  memoryInuse: number;
  version: string;
  startedAt: number | null;

  fetchState: () => Promise<void>;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  toggleConnection: () => Promise<void>;
  setMode: (mode: ProxyMode) => Promise<void>;
  subscribeTraffic: () => () => void;
  subscribeStateChanges: () => () => void;
  fetchDashboardInfo: () => Promise<void>;
}

function timeLabel(): string {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export const useConnectionStore = create<ConnectionStore>((set, get) => ({
  status: "disconnected",
  mode: "rule",
  activeNode: null,
  uploadSpeed: 0,
  downloadSpeed: 0,
  totalUpload: 0,
  totalDownload: 0,
  latency: 0,
  speedHistory: [],
  activeConnections: 0,
  memoryInuse: 0,
  version: "",
  startedAt: null,

  async fetchState() {
    const state = await connectionService.getState();
    set({
      status: state.status,
      mode: state.mode,
      activeNode: state.activeNode,
    });
  },

  async connect() {
    set({ status: "connecting" });
    try {
      await connectionService.connect();
      await get().fetchState();
    } catch (e) {
      set({ status: "disconnected" });
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("sing-box", { description: msg, duration: 8000 });
    }
  },

  async disconnect() {
    set({ status: "disconnecting" });
    try {
      await connectionService.disconnect();
    } catch { /* ignore */ }
    set({
      status: "disconnected",
      activeNode: null,
      uploadSpeed: 0,
      downloadSpeed: 0,
    });
  },

  async toggleConnection() {
    const s = get().status;
    if (s === "connecting" || s === "disconnecting") return;
    if (s === "connected") {
      await get().disconnect();
    } else {
      await get().connect();
    }
  },

  async setMode(mode) {
    set({ mode });
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("update_settings", { updates: { proxyMode: mode } });
    } catch { /* ignore in non-Tauri env */ }
  },

  subscribeTraffic() {
    set({ startedAt: Date.now() });

    const unsub = connectionService.subscribeTraffic((up, down) => {
      set((state) => {
        const record: SpeedRecord = {
          time: timeLabel(),
          upload: up,
          download: down,
        };
        const history = [...state.speedHistory, record].slice(-MAX_HISTORY);
        return {
          uploadSpeed: up,
          downloadSpeed: down,
          speedHistory: history,
        };
      });
    });

    // Poll dashboard info every 2 seconds for totals, connections, memory
    const interval = setInterval(async () => {
      try {
        const info = await connectionService.getDashboardInfo();
        set({
          totalUpload: info.uploadTotal,
          totalDownload: info.downloadTotal,
          activeConnections: info.activeConnections,
          memoryInuse: info.memoryInuse,
          version: info.version,
        });
      } catch {
        // ignore polling errors
      }
    }, 2000);

    return () => {
      unsub();
      clearInterval(interval);
    };
  },

  subscribeStateChanges() {
    return connectionService.subscribeStateChanges((snapshot) => {
      const prevStatus = get().status;
      set({
        status: snapshot.status,
        mode: snapshot.mode,
        activeNode: snapshot.activeNode,
      });

      // Show crash reason when sing-box stops unexpectedly
      if (
        prevStatus === "connected" &&
        snapshot.status === "disconnected" &&
        snapshot.crashReason
      ) {
        toast.error("sing-box crashed", {
          description: snapshot.crashReason,
          duration: 15000,
        });
      }
    });
  },

  async fetchDashboardInfo() {
    try {
      const info = await connectionService.getDashboardInfo();
      set({
        totalUpload: info.uploadTotal,
        totalDownload: info.downloadTotal,
        activeConnections: info.activeConnections,
        memoryInuse: info.memoryInuse,
        version: info.version,
      });
    } catch {
      // ignore
    }
  },
}));
