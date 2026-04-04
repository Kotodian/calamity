import { create } from "zustand";
import { syncAppLanguage } from "@/i18n";
import { settingsService } from "../services/settings";
import type { AppSettings, Theme, TunRuntimeStatus } from "../services/types";

interface SettingsStore {
  settings: AppSettings | null;
  tunStatus: TunRuntimeStatus | null;
  fetchSettings: () => Promise<void>;
  fetchTunStatus: () => Promise<void>;
  updateSettings: (settings: Partial<AppSettings>) => Promise<void>;
  subscribeSettingsChanges: () => () => void;
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
  tunStatus: null,

  async fetchSettings() {
    const [settings, tunStatus] = await Promise.all([
      settingsService.getSettings(),
      settingsService.getTunStatus(),
    ]);
    set({ settings, tunStatus });
    applyTheme(settings.theme);
    await syncAppLanguage(settings.language);
  },
  async fetchTunStatus() {
    const tunStatus = await settingsService.getTunStatus();
    set({ tunStatus });
  },
  async updateSettings(updates) {
    // Optimistic update: apply locally first for responsive UI
    const current = get().settings;
    if (current) {
      const nextSettings = {
        ...current,
        ...updates,
        tunConfig: updates.tunConfig ? { ...current.tunConfig, ...updates.tunConfig } : current.tunConfig,
      };
      if (nextSettings.enhancedMode || nextSettings.gatewayMode) {
        nextSettings.systemProxy = false;
      }
      set({ settings: nextSettings });
    }
    if (updates.language) {
      await syncAppLanguage(updates.language);
    }
    await settingsService.updateSettings(updates);
    await get().fetchSettings();
  },
  subscribeSettingsChanges() {
    let unlisten: (() => void) | null = null;
    let cancelled = false;

    (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        unlisten = await listen("settings-changed", async () => {
          if (!cancelled) {
            await get().fetchSettings();
          }
        });
      } catch { /* ignore in non-Tauri env */ }
    })();

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  },
  setTheme(theme) {
    applyTheme(theme);
    get().updateSettings({ theme });
  },
}));
