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
    });
  });

  it("fetchState populates store from service", async () => {
    await useConnectionStore.getState().fetchState();
    const state = useConnectionStore.getState();
    expect(state.status).toBe("connected");
    expect(state.activeNode).toBeTruthy();
    expect(state.latency).toBeGreaterThan(0);
  });

  it("toggleConnection connects when disconnected", async () => {
    await useConnectionStore.getState().toggleConnection();
    expect(useConnectionStore.getState().status).toBe("connected");
  });

  it("toggleConnection disconnects when connected", async () => {
    await useConnectionStore.getState().connect();
    expect(useConnectionStore.getState().status).toBe("connected");
    await useConnectionStore.getState().toggleConnection();
    expect(useConnectionStore.getState().status).toBe("disconnected");
  });

  it("setMode updates proxy mode", async () => {
    await useConnectionStore.getState().setMode("global");
    expect(useConnectionStore.getState().mode).toBe("global");
  });

  it("fetchSpeedHistory populates history", async () => {
    await useConnectionStore.getState().fetchSpeedHistory();
    expect(useConnectionStore.getState().speedHistory.length).toBeGreaterThan(0);
  });
});
