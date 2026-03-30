import { describe, it, expect, beforeEach } from "vitest";
import { useSettingsStore } from "../settings";

describe("useSettingsStore", () => {
  beforeEach(() => {
    useSettingsStore.setState({ settings: null, tunStatus: null });
  });

  it("fetchSettings loads settings", async () => {
    await useSettingsStore.getState().fetchSettings();
    const settings = useSettingsStore.getState().settings;
    expect(settings).not.toBeNull();
    expect(settings!.theme).toBeTruthy();
  });

  it("updateSettings merges changes", async () => {
    await useSettingsStore.getState().fetchSettings();
    await useSettingsStore.getState().updateSettings({ autoStart: true });
    expect(useSettingsStore.getState().settings!.autoStart).toBe(true);
  });

  it("fetchSettings loads TUN runtime status", async () => {
    await useSettingsStore.getState().fetchSettings();
    const tunStatus = useSettingsStore.getState().tunStatus;
    expect(tunStatus).not.toBeNull();
    expect(tunStatus!.mode).toBeTruthy();
  });

  it("updateSettings keeps system proxy off when TUN is enabled", async () => {
    await useSettingsStore.getState().fetchSettings();
    await useSettingsStore.getState().updateSettings({ enhancedMode: true, systemProxy: true });
    expect(useSettingsStore.getState().settings!.enhancedMode).toBe(true);
    expect(useSettingsStore.getState().settings!.systemProxy).toBe(false);
    expect(useSettingsStore.getState().tunStatus!.effectiveDnsMode).toBe("fake-ip");
  });

  it("setTheme applies class and updates settings", async () => {
    await useSettingsStore.getState().fetchSettings();
    useSettingsStore.getState().setTheme("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    useSettingsStore.getState().setTheme("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});
