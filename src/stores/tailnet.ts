import { create } from "zustand";
import { tailnetService } from "../services/tailnet";
import type { TailnetDevice, TailscaleSettings } from "../services/types";

interface TailnetStore {
  settings: TailscaleSettings | null;
  devices: TailnetDevice[];
  loading: boolean;
  fetchSettings: () => Promise<void>;
  saveSettings: (settings: TailscaleSettings) => Promise<void>;
  fetchDevices: () => Promise<void>;
  setExitNode: (exitNode: string) => Promise<void>;
}

export const useTailnetStore = create<TailnetStore>((set, get) => ({
  settings: null,
  devices: [],
  loading: false,

  async fetchSettings() {
    const settings = await tailnetService.getSettings();
    set({ settings });
  },
  async saveSettings(settings) {
    await tailnetService.saveSettings(settings);
    set({ settings });
  },
  async fetchDevices() {
    set({ loading: true });
    try {
      const devices = await tailnetService.getDevices();
      set({ devices });
    } catch (e) {
      console.error("Failed to fetch devices:", e);
    } finally {
      set({ loading: false });
    }
  },
  async setExitNode(exitNode) {
    await tailnetService.setExitNode(exitNode);
    const settings = get().settings;
    if (settings) {
      set({ settings: { ...settings, exitNode } });
    }
  },
}));
