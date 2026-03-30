import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectionState } from "@/services/types";

const mockedConnection = vi.hoisted(() => ({
  currentState: {
    status: "connected" as const,
    mode: "rule" as const,
    activeNode: "US-West" as string | null,
    uploadSpeed: 0,
    downloadSpeed: 0,
    totalUpload: 0,
    totalDownload: 0,
    latency: 0,
  } as ConnectionState,
  disconnect: vi.fn(async () => undefined),
}));

vi.mock("../../services/connection", () => ({
  connectionService: {
    getState: vi.fn(async () => ({ ...mockedConnection.currentState })),
    connect: vi.fn(async () => undefined),
    disconnect: mockedConnection.disconnect,
    setMode: vi.fn(async () => undefined),
    subscribeTraffic: vi.fn(() => () => {}),
    subscribeStateChanges: vi.fn(() => () => {}),
    getDashboardInfo: vi.fn(async () => ({
      running: false,
      version: "test",
      activeConnections: 0,
      uploadTotal: 0,
      downloadTotal: 0,
      memoryInuse: 0,
    })),
  },
}));

describe("useConnectionStore disconnect", () => {
  beforeEach(() => {
    vi.resetModules();
    mockedConnection.disconnect.mockClear();
    mockedConnection.currentState = {
      status: "connected",
      mode: "rule",
      activeNode: "US-West",
      uploadSpeed: 0,
      downloadSpeed: 0,
      totalUpload: 0,
      totalDownload: 0,
      latency: 0,
    };
  });

  it("transitions through disconnecting state and clears speeds", async () => {
    const { useConnectionStore } = await import("../connection?disconnect-state");

    useConnectionStore.setState({
      status: "connected",
      mode: "rule",
      activeNode: "US-West",
      uploadSpeed: 10,
      downloadSpeed: 20,
      totalUpload: 0,
      totalDownload: 0,
      latency: 0,
      speedHistory: [],
      activeConnections: 0,
      memoryInuse: 0,
      version: "",
      startedAt: null,
    });

    const promise = useConnectionStore.getState().disconnect();

    // Should be in disconnecting state immediately
    expect(useConnectionStore.getState().status).toBe("disconnecting");

    await promise;

    expect(mockedConnection.disconnect).toHaveBeenCalledTimes(1);
    expect(useConnectionStore.getState().status).toBe("disconnected");
    expect(useConnectionStore.getState().activeNode).toBeNull();
    expect(useConnectionStore.getState().uploadSpeed).toBe(0);
    expect(useConnectionStore.getState().downloadSpeed).toBe(0);
  });
});
