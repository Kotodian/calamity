import type { AiAuthSettings, ProviderStatus } from "./types";

export interface AiAuthService {
  getSettings(): Promise<AiAuthSettings>;
  scanProviders(): Promise<ProviderStatus[]>;
  updateSettings(settings: AiAuthSettings): Promise<void>;
  installCaCert(): Promise<void>;
  exportCaCert(): Promise<string>;
  test(provider: string): Promise<string>;
}

function createTauriAiAuthService(): AiAuthService {
  return {
    async getSettings() {
      const { invoke } = await import("@tauri-apps/api/core");
      return invoke<AiAuthSettings>("ai_auth_get_settings");
    },
    async scanProviders() {
      const { invoke } = await import("@tauri-apps/api/core");
      return invoke<ProviderStatus[]>("ai_auth_scan_providers");
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
    async test(provider) {
      const { invoke } = await import("@tauri-apps/api/core");
      return invoke<string>("ai_auth_test", { provider });
    },
  };
}

function createMockAiAuthService(): AiAuthService {
  return {
    async getSettings() {
      return { enabled: false, proxyPort: 8443, providers: [] };
    },
    async scanProviders() {
      return [
        { provider: "open_ai", name: "OpenAI", enabled: false, credentialFound: true, source: "env:OPENAI_API_KEY" },
        { provider: "anthropic", name: "Anthropic", enabled: false, credentialFound: true, source: "env:ANTHROPIC_API_KEY" },
        { provider: "google_gemini", name: "Google Gemini", enabled: false, credentialFound: false, source: "" },
      ];
    },
    async updateSettings() {},
    async installCaCert() {},
    async exportCaCert() { return "/tmp/calamity-ca.pem"; },
    async test() { return "Mock test successful"; },
  };
}

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
export const aiAuthService: AiAuthService = isTauri
  ? createTauriAiAuthService()
  : createMockAiAuthService();
