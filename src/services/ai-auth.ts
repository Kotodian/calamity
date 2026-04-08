import type { AiAuthSettings } from "./types";

export interface AiAuthService {
  getSettings(): Promise<AiAuthSettings>;
  updateSettings(settings: AiAuthSettings): Promise<void>;
  installCaCert(): Promise<void>;
  exportCaCert(): Promise<string>;
  refreshTokens(): Promise<void>;
  test(provider: string): Promise<string>;
}

function createTauriAiAuthService(): AiAuthService {
  return {
    async getSettings() {
      const { invoke } = await import("@tauri-apps/api/core");
      return invoke<AiAuthSettings>("ai_auth_get_settings");
    },
    async updateSettings(settings) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("ai_auth_update_settings", { settings });
    },
    async installCaCert() {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("ai_auth_install_ca_cert");
    },
    async exportCaCert() {
      const { invoke } = await import("@tauri-apps/api/core");
      return invoke<string>("ai_auth_export_ca_cert");
    },
    async refreshTokens() {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("ai_auth_refresh_tokens");
    },
    async test(provider) {
      const { invoke } = await import("@tauri-apps/api/core");
      return invoke<string>("ai_auth_test", { provider });
    },
  };
}

function createMockAiAuthService(): AiAuthService {
  let mockSettings: AiAuthSettings = {
    enabled: false,
    proxyPort: 8443,
    services: [
      {
        id: "mock-1",
        provider: "open_ai",
        enabled: true,
        authType: "api_key",
        apiKey: "sk-mock-key-xxxxx",
        oauthClientId: "",
        oauthClientSecret: "",
        oauthTokenUrl: "",
        oauthAccessToken: "",
        oauthTokenExpires: "",
        oauthScopes: "",
      },
    ],
  };

  return {
    async getSettings() {
      return JSON.parse(JSON.stringify(mockSettings));
    },
    async updateSettings(settings) {
      mockSettings = JSON.parse(JSON.stringify(settings));
    },
    async installCaCert() {
      // mock
    },
    async exportCaCert() {
      return "/tmp/calamity-ca.pem";
    },
    async refreshTokens() {
      // mock
    },
    async test() {
      return "Mock test successful";
    },
  };
}

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
export const aiAuthService: AiAuthService = isTauri
  ? createTauriAiAuthService()
  : createMockAiAuthService();
