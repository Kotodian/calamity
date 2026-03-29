import { describe, it, expect } from "vitest";
import { connectionService } from "../connection";

describe("connectionService", () => {
  it("returns initial connected state", async () => {
    const state = await connectionService.getState();
    expect(state.status).toBe("connected");
    expect(state.mode).toBe("rule");
    expect(state.activeNode).toBeTruthy();
    expect(state.latency).toBeGreaterThan(0);
  });

  it("disconnect changes status", async () => {
    await connectionService.disconnect();
    const state = await connectionService.getState();
    expect(state.status).toBe("disconnected");
  });

  it("connect changes status back", async () => {
    await connectionService.connect();
    const state = await connectionService.getState();
    expect(state.status).toBe("connected");
  });

  it("setMode changes proxy mode", async () => {
    await connectionService.setMode("global");
    const state = await connectionService.getState();
    expect(state.mode).toBe("global");
    // Reset
    await connectionService.setMode("rule");
  });

  it("getSpeedHistory returns records with expected shape", async () => {
    const history = await connectionService.getSpeedHistory(5);
    expect(history.length).toBeGreaterThan(0);
    expect(history[0]).toHaveProperty("time");
    expect(history[0]).toHaveProperty("upload");
    expect(history[0]).toHaveProperty("download");
    expect(typeof history[0].upload).toBe("number");
  });

  it("getState returns a copy, not reference", async () => {
    const a = await connectionService.getState();
    const b = await connectionService.getState();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});
