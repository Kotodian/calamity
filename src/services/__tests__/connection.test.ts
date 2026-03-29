import { describe, it, expect } from "vitest";
import { connectionService } from "../connection";

describe("connectionService (mock)", () => {
  it("returns initial disconnected state", async () => {
    const state = await connectionService.getState();
    expect(state.status).toBe("disconnected");
    expect(state.mode).toBe("rule");
    expect(state.activeNode).toBeNull();
  });

  it("connect and disconnect are callable", async () => {
    await connectionService.connect();
    await connectionService.disconnect();
  });

  it("subscribeTraffic returns an unsubscribe function", () => {
    const unsub = connectionService.subscribeTraffic(() => {});
    expect(typeof unsub).toBe("function");
    unsub();
  });

  it("getDashboardInfo returns expected shape", async () => {
    const info = await connectionService.getDashboardInfo();
    expect(info).toHaveProperty("running");
    expect(info).toHaveProperty("version");
    expect(info).toHaveProperty("activeConnections");
    expect(info).toHaveProperty("uploadTotal");
    expect(info).toHaveProperty("downloadTotal");
    expect(info).toHaveProperty("memoryInuse");
  });

  it("getState returns a new object each call", async () => {
    const a = await connectionService.getState();
    const b = await connectionService.getState();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});
