import { describe, it, expect } from "vitest";
import { settingsService } from "../settings";

describe("settingsService TUN/enhanced mode", () => {
  it("default settings have enhancedMode disabled", async () => {
    const s = await settingsService.getSettings();
    expect(s.enhancedMode).toBe(false);
    expect(s.tunConfig).toBeTruthy();
    expect(s.tunConfig.stack).toBe("system");
  });

  it("can enable enhanced mode", async () => {
    await settingsService.updateSettings({ enhancedMode: true });
    const s = await settingsService.getSettings();
    expect(s.enhancedMode).toBe(true);
  });

  it("can update TUN config", async () => {
    await settingsService.updateSettings({
      tunConfig: { stack: "gvisor", mtu: 1500, autoRoute: true, strictRoute: false, dnsHijack: ["198.18.0.2:53"] },
    });
    const s = await settingsService.getSettings();
    expect(s.tunConfig.stack).toBe("gvisor");
    expect(s.tunConfig.mtu).toBe(1500);
    expect(s.tunConfig.dnsHijack).toContain("198.18.0.2:53");
  });

  it("can disable enhanced mode", async () => {
    await settingsService.updateSettings({ enhancedMode: false });
    const s = await settingsService.getSettings();
    expect(s.enhancedMode).toBe(false);
  });

  it("forces system proxy off when enhanced mode is enabled", async () => {
    await settingsService.updateSettings({ systemProxy: true, enhancedMode: true });
    const s = await settingsService.getSettings();
    expect(s.systemProxy).toBe(false);
  });

  it("reports fake-ip as the effective DNS mode when TUN is enabled", async () => {
    await settingsService.updateSettings({ enhancedMode: true });
    const status = await settingsService.getTunStatus();
    expect(status.mode).toBe("tun");
    expect(status.targetEnhancedMode).toBe(true);
    expect(status.effectiveDnsMode).toBe("fake-ip");
  });
});
