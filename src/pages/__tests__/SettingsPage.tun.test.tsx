import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAppI18n } from "@/i18n";
import { SettingsPage } from "../SettingsPage";
import { useSettingsStore } from "@/stores/settings";
import type { AppSettings, TunRuntimeStatus } from "@/services/types";

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
    running: false,
    mode: "tun",
    targetEnhancedMode: true,
    requiresAdmin: true,
    lastError: "permission denied",
    effectiveDnsMode: "fake-ip",
    ...overrides,
  };
}

describe("SettingsPage TUN state", () => {
  beforeEach(() => {
    useSettingsStore.setState({
      settings: buildSettings(),
      tunStatus: buildTunStatus(),
      fetchSettings: vi.fn(async () => {}),
      fetchTunStatus: vi.fn(async () => {}),
      updateSettings: vi.fn(async () => {}),
      setTheme: vi.fn(),
    });
  });

  it("renders TUN status, admin warning, and proxy conflict copy", async () => {
    const i18n = await createAppI18n({
      language: "en",
      systemLocales: ["en-US"],
    });

    render(
      <I18nextProvider i18n={i18n}>
        <SettingsPage />
      </I18nextProvider>
    );

    expect(screen.getByText("TUN Status")).toBeTruthy();
    expect(screen.getByText("TUN mode is selected but not running")).toBeTruthy();
    expect(screen.getByText("Administrator approval is required whenever TUN mode starts.")).toBeTruthy();
    expect(screen.getByText("System proxy stays off while TUN mode is enabled.")).toBeTruthy();
    expect(screen.getByText("Last error: permission denied")).toBeTruthy();
  });
});
