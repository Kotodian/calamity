import type { AppSettings, Theme, TunRuntimeStatus } from "./types";

export interface SettingsService {
  getSettings(): Promise<AppSettings>;
  getTunStatus(): Promise<TunRuntimeStatus>;
  updateSettings(settings: Partial<AppSettings>): Promise<void>;
  setTheme(theme: Theme): Promise<void>;
}

// ---- Mock Implementation ----

let mockSettings: AppSettings = {
  theme: "dark",
  language: "system",
  singboxPath: "sing-box",
  autoStart: false,
  systemProxy: true,
  enhancedMode: false,
  tunConfig: {
    stack: "system",
    mtu: 9000,
    autoRoute: true,
    strictRoute: false,
    dnsHijack: ["198.18.0.2:53"],
  },
  allowLan: false,
  httpPort: 7890,
  socksPort: 7891,
  mixedPort: 7893,
  logLevel: "info",
};

function buildMockTunStatus(): TunRuntimeStatus {
  return {
    running: mockSettings.enhancedMode,
    mode: mockSettings.enhancedMode ? "tun" : "normal",
    targetEnhancedMode: mockSettings.enhancedMode,
    requiresAdmin: mockSettings.enhancedMode,
    lastError: null,
    effectiveDnsMode: mockSettings.enhancedMode ? "fake-ip" : null,
  };
}

const mockSettingsService: SettingsService = {
  async getSettings() {
    return { ...mockSettings, tunConfig: { ...mockSettings.tunConfig, dnsHijack: [...mockSettings.tunConfig.dnsHijack] } };
  },
  async getTunStatus() {
    return { ...buildMockTunStatus() };
  },
  async updateSettings(settings) {
    mockSettings = {
      ...mockSettings,
      ...settings,
      tunConfig: settings.tunConfig
        ? {
            ...mockSettings.tunConfig,
            ...settings.tunConfig,
            dnsHijack: [...settings.tunConfig.dnsHijack],
          }
        : mockSettings.tunConfig,
    };
    if (mockSettings.enhancedMode) {
      mockSettings.systemProxy = false;
    }
  },
  async setTheme(theme) {
    mockSettings.theme = theme;
  },
};

// ---- Tauri Implementation ----

function createTauriSettingsService(): SettingsService {
  return {
    async getSettings() {
      const { invoke } = await import("@tauri-apps/api/core");
      return invoke<AppSettings>("get_settings");
    },
    async getTunStatus() {
      const { invoke } = await import("@tauri-apps/api/core");
      return invoke<TunRuntimeStatus>("get_tun_status");
    },
    async updateSettings(settings) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("update_settings", { updates: settings });
    },
    async setTheme(theme) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("update_settings", { updates: { theme } });
    },
  };
}

// ---- Export ----

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
export const settingsService: SettingsService = isTauri ? createTauriSettingsService() : mockSettingsService;
