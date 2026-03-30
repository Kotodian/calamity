import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAppI18n } from "@/i18n";
import { DnsPage } from "../DnsPage";
import { useDnsStore } from "@/stores/dns";
import { useNodesStore } from "@/stores/nodes";
import { useRulesStore } from "@/stores/rules";
import { useSettingsStore } from "@/stores/settings";
import type { AppSettings, DnsConfig, TunRuntimeStatus } from "@/services/types";

function buildSettings(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    theme: "dark",
    language: "en",
    singboxPath: "sing-box",
    autoStart: false,
    systemProxy: false,
    enhancedMode: true,
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
    ...overrides,
  };
}

function buildTunStatus(overrides: Partial<TunRuntimeStatus> = {}): TunRuntimeStatus {
  return {
    running: true,
    mode: "tun",
    targetEnhancedMode: true,
    requiresAdmin: true,
    lastError: null,
    effectiveDnsMode: "fake-ip",
    ...overrides,
  };
}

function buildDnsConfig(overrides: Partial<DnsConfig> = {}): DnsConfig {
  return {
    mode: "direct",
    final: "dns-direct",
    fakeIpRange: "198.18.0.0/15",
    servers: [],
    ...overrides,
  };
}

describe("DnsPage TUN DNS mode", () => {
  beforeEach(() => {
    useSettingsStore.setState({
      settings: buildSettings(),
      tunStatus: buildTunStatus(),
      fetchSettings: vi.fn(async () => {}),
      fetchTunStatus: vi.fn(async () => {}),
      updateSettings: vi.fn(async () => {}),
      setTheme: vi.fn(),
    });
    useDnsStore.setState({
      config: buildDnsConfig(),
      rules: [],
      fetchAll: vi.fn(async () => {}),
      updateConfig: vi.fn(async () => {}),
      addServer: vi.fn(async () => {}),
      updateServer: vi.fn(async () => {}),
      deleteServer: vi.fn(async () => {}),
      addRule: vi.fn(async () => {}),
      deleteRule: vi.fn(async () => {}),
    });
    useNodesStore.setState({
      groups: [],
      selectedGroup: "proxy",
      testing: false,
      latencyMap: {},
      testingNodes: new Set(),
      fetchGroups: vi.fn(async () => {}),
      selectGroup: vi.fn(),
      testLatency: vi.fn(async () => {}),
      testAllLatency: vi.fn(async () => {}),
      setActiveNode: vi.fn(async () => {}),
      disconnectNode: vi.fn(async () => {}),
      addNode: vi.fn(async () => {}),
      updateNode: vi.fn(async () => {}),
      removeNode: vi.fn(async () => {}),
      addGroup: vi.fn(async () => {}),
      removeGroup: vi.fn(async () => {}),
      renameGroup: vi.fn(async () => {}),
    });
    useRulesStore.setState({
      rules: [],
      fetchRules: vi.fn(async () => {}),
      addRule: vi.fn(async () => {}),
      updateRule: vi.fn(async () => {}),
      deleteRule: vi.fn(async () => {}),
      reorderRules: vi.fn(async () => {}),
    });
  });

  it("shows that fake-ip is forced while TUN mode is active", async () => {
    const i18n = await createAppI18n({
      language: "en",
      systemLocales: ["en-US"],
    });

    render(
      <I18nextProvider i18n={i18n}>
        <DnsPage />
      </I18nextProvider>
    );

    expect(screen.getByText("Fake-IP (forced by TUN)")).toBeTruthy();
    expect(screen.getByText("TUN mode forces Fake-IP while running. Range: 198.18.0.0/15")).toBeTruthy();
  });
});
