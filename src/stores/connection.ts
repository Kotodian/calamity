import { create } from "zustand";
import { connectionService } from "../services/connection";
import type { ConnectionState, ProxyMode, SpeedRecord } from "../services/types";

interface ConnectionStore extends ConnectionState {
  speedHistory: SpeedRecord[];
  fetchState: () => Promise<void>;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  toggleConnection: () => Promise<void>;
  setMode: (mode: ProxyMode) => Promise<void>;
  fetchSpeedHistory: () => Promise<void>;
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

  async fetchState() {
    const state = await connectionService.getState();
    set(state);
  },
  async connect() {
    set({ status: "connecting" });
    await connectionService.connect();
    set({ status: "connected" });
  },
  async disconnect() {
    await connectionService.disconnect();
    set({ status: "disconnected" });
  },
  async toggleConnection() {
    if (get().status === "connected") {
      await get().disconnect();
    } else {
      await get().connect();
    }
  },
  async setMode(mode) {
    await connectionService.setMode(mode);
    set({ mode });
  },
  async fetchSpeedHistory() {
    const history = await connectionService.getSpeedHistory(30);
    set({ speedHistory: history });
  },
}));
