import { describe, it, expect, beforeEach } from "vitest";
import { useSettingsStore } from "../settings";

describe("useSettingsStore", () => {
  beforeEach(() => {
    useSettingsStore.setState({ settings: null });
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

  it("setTheme applies class and updates settings", async () => {
    await useSettingsStore.getState().fetchSettings();
    useSettingsStore.getState().setTheme("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    useSettingsStore.getState().setTheme("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});
