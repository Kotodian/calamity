import type { TailnetDevice, TailscaleSettings } from "./types";

export interface TailnetService {
  getSettings(): Promise<TailscaleSettings>;
  saveSettings(settings: TailscaleSettings): Promise<void>;
  getDevices(): Promise<TailnetDevice[]>;
  setExitNode(exitNode: string): Promise<void>;
  testOAuth(clientId: string, clientSecret: string): Promise<string>;
}

function createTauriTailnetService(): TailnetService {
  return {
    async getSettings() {
      const { invoke } = await import("@tauri-apps/api/core");
      return invoke<TailscaleSettings>("tailscale_get_settings");
    },
    async saveSettings(settings) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("tailscale_save_settings", { settings });
    },
    async getDevices() {
      const { invoke } = await import("@tauri-apps/api/core");
      return invoke<TailnetDevice[]>("tailscale_get_devices");
    },
    async setExitNode(exitNode) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("tailscale_set_exit_node", { exitNode });
    },
    async testOAuth(clientId, clientSecret) {
      const { invoke } = await import("@tauri-apps/api/core");
      return invoke<string>("tailscale_test_oauth", { clientId, clientSecret });
    },
  };
}

function createMockTailnetService(): TailnetService {
  let mockSettings: TailscaleSettings = {
    enabled: false,
    authKey: "",
    oauthClientId: "",
    oauthClientSecret: "",
    oauthAccessToken: "",
    oauthTokenExpires: "",
    tailnet: "",
    hostname: "calamity",
    exitNode: "",
    acceptRoutes: false,
    advertiseRoutes: [],
  };

  const mockDevices: TailnetDevice[] = [
    { id: "d1", name: "MacBook Pro", hostname: "macbook-pro", ip: "100.64.0.1", os: "macOS", status: "online", lastSeen: new Date().toISOString(), isExitNode: false, isCurrentExitNode: false, isSelf: true },
    { id: "d2", name: "Home Server", hostname: "homelab-nas", ip: "100.64.0.2", os: "Linux", status: "online", lastSeen: new Date().toISOString(), isExitNode: true, isCurrentExitNode: false, isSelf: false },
    { id: "d3", name: "Office Desktop", hostname: "office-pc", ip: "100.64.0.3", os: "Windows", status: "online", lastSeen: new Date().toISOString(), isExitNode: true, isCurrentExitNode: false, isSelf: false },
  ];

  return {
    async getSettings() { return { ...mockSettings }; },
    async saveSettings(s) { mockSettings = { ...s }; },
    async getDevices() { return mockDevices.map(d => ({ ...d })); },
    async setExitNode(exitNode) { mockSettings.exitNode = exitNode; },
    async testOAuth() { return "Mock OAuth success"; },
  };
}

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
export const tailnetService: TailnetService = isTauri
  ? createTauriTailnetService()
  : createMockTailnetService();
