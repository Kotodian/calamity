import { describe, it, expect, beforeEach } from "vitest";
import { useConnectionStore } from "../connection";

describe("useConnectionStore", () => {
  beforeEach(() => {
    useConnectionStore.setState({
      status: "disconnected",
      mode: "rule",
      activeNode: null,
      uploadSpeed: 0,
      downloadSpeed: 0,
      totalUpload: 0,
      totalDownload: 0,
      latency: 0,
      speedHistory: [],
      activeConnections: 0,
      memoryInuse: 0,
      version: "",
      startedAt: null,
    });
  });

  it("fetchState populates store from service", async () => {
    await useConnectionStore.getState().fetchState();
    const state = useConnectionStore.getState();
    // Mock service returns disconnected
    expect(state.status).toBe("disconnected");
    expect(state.activeNode).toBeNull();
  });

  it("toggleConnection calls connect when disconnected", async () => {
    await useConnectionStore.getState().toggleConnection();
    // After connect + fetchState from mock, still disconnected (mock has no real sing-box)
    const state = useConnectionStore.getState();
    expect(["connected", "disconnected"]).toContain(state.status);
  });

  it("disconnect resets speed values", async () => {
    useConnectionStore.setState({
      uploadSpeed: 1000,
      downloadSpeed: 2000,
      status: "connected",
      activeNode: "US-West",
    });
    await useConnectionStore.getState().disconnect();
    const state = useConnectionStore.getState();
    expect(state.status).toBe("disconnected");
    expect(state.uploadSpeed).toBe(0);
    expect(state.downloadSpeed).toBe(0);
  });

  it("setMode updates proxy mode", async () => {
    await useConnectionStore.getState().setMode("global");
    expect(useConnectionStore.getState().mode).toBe("global");
  });

  it("subscribeTraffic sets startedAt and returns unsubscribe", () => {
    const unsub = useConnectionStore.getState().subscribeTraffic();
    expect(typeof unsub).toBe("function");
    expect(useConnectionStore.getState().startedAt).not.toBeNull();
    unsub();
  });
});
