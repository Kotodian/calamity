import { describe, it, expect } from "vitest";
import { settingsService } from "../settings";

describe("settingsService", () => {
  it("getSettings returns default settings", async () => {
    const settings = await settingsService.getSettings();
    expect(settings.theme).toBeTruthy();
    expect(settings.singboxPath).toBeTruthy();
    expect(typeof settings.httpPort).toBe("number");
  });

  it("updateSettings merges partial updates", async () => {
    await settingsService.updateSettings({ autoStart: true });
    const settings = await settingsService.getSettings();
    expect(settings.autoStart).toBe(true);
    // Other fields preserved
    expect(settings.singboxPath).toBeTruthy();
  });

  it("setTheme changes theme setting", async () => {
    await settingsService.setTheme("dark");
    const settings = await settingsService.getSettings();
    expect(settings.theme).toBe("dark");
    await settingsService.setTheme("light");
  });

  it("getSettings returns a copy", async () => {
    const a = await settingsService.getSettings();
    const b = await settingsService.getSettings();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});
