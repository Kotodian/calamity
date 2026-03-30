import { beforeEach, describe, expect, it, vi } from "vitest";

const mockedInvoke = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mockedInvoke,
}));

describe("connectionService (tauri)", () => {
  beforeEach(() => {
    vi.resetModules();
    mockedInvoke.mockClear();
    Object.defineProperty(globalThis, "window", {
      value: { __TAURI_INTERNALS__: true },
      configurable: true,
      writable: true,
    });
  });

  it("disconnect stops sing-box instead of only clearing the active node", async () => {
    const { connectionService } = await import("../connection?tauri-disconnect-test");

    await connectionService.disconnect();

    expect(mockedInvoke).toHaveBeenCalledWith("singbox_stop");
  });
});
