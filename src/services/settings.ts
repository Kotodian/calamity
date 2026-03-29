import type { AppSettings, Theme } from "./types";

export interface SettingsService {
  getSettings(): Promise<AppSettings>;
  updateSettings(settings: Partial<AppSettings>): Promise<void>;
  setTheme(theme: Theme): Promise<void>;
}

let mockSettings: AppSettings = {
  theme: "dark",
  singboxPath: "/usr/local/bin/sing-box",
  autoStart: false,
  systemProxy: true,
  allowLan: false,
  httpPort: 7890,
  socksPort: 7891,
  mixedPort: 7892,
  logLevel: "info",
};

export const settingsService: SettingsService = {
  async getSettings() {
    return { ...mockSettings };
  },
  async updateSettings(settings) {
    mockSettings = { ...mockSettings, ...settings };
  },
  async setTheme(theme) {
    mockSettings.theme = theme;
  },
};
