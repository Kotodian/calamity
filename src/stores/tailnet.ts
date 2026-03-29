import { create } from "zustand";
import { tailnetService } from "../services/tailnet";
import type { TailnetDevice } from "../services/types";

interface TailnetStore {
  devices: TailnetDevice[];
  fetchDevices: () => Promise<void>;
  setExitNode: (deviceId: string | null) => Promise<void>;
}

export const useTailnetStore = create<TailnetStore>((set, get) => ({
  devices: [],

  async fetchDevices() {
    const devices = await tailnetService.getDevices();
    set({ devices });
  },
  async setExitNode(deviceId) {
    await tailnetService.setExitNode(deviceId);
    await get().fetchDevices();
  },
}));
