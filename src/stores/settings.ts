import { create } from "zustand";
import { settingsService } from "../services/settings";
import type { AppSettings, Theme } from "../services/types";

interface SettingsStore {
  settings: AppSettings | null;
  fetchSettings: () => Promise<void>;
  updateSettings: (settings: Partial<AppSettings>) => Promise<void>;
  setTheme: (theme: Theme) => void;
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "dark") {
    root.classList.add("dark");
  } else if (theme === "light") {
    root.classList.remove("dark");
  } else {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.classList.toggle("dark", prefersDark);
  }
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  settings: null,

  async fetchSettings() {
    const settings = await settingsService.getSettings();
    set({ settings });
    applyTheme(settings.theme);
  },
  async updateSettings(updates) {
    await settingsService.updateSettings(updates);
    await get().fetchSettings();
  },
  setTheme(theme) {
    applyTheme(theme);
    get().updateSettings({ theme });
  },
}));
