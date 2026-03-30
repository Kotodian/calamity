import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectionSnapshot, ConnectionState } from "@/services/types";

const mockedState = vi.hoisted(() => ({
  currentState: {
    status: "disconnected" as const,
    mode: "rule" as const,
    activeNode: null as string | null,
    uploadSpeed: 0,
    downloadSpeed: 0,
    totalUpload: 0,
    totalDownload: 0,
    latency: 0,
  } as ConnectionState,
  snapshotHandler: null as ((snapshot: ConnectionSnapshot) => void | Promise<void>) | null,
  subscribeStateChanges: vi.fn((onChange: (snapshot: ConnectionSnapshot) => void | Promise<void>) => {
    mockedState.snapshotHandler = onChange;
    return () => {
      mockedState.snapshotHandler = null;
    };
  }),
}));

vi.mock("../../services/connection", () => ({
  connectionService: {
    getState: vi.fn(async () => ({ ...mockedState.currentState })),
    connect: vi.fn(async () => {}),
    disconnect: vi.fn(async () => {}),
    setMode: vi.fn(async () => {}),
    subscribeTraffic: vi.fn(() => () => {}),
    getDashboardInfo: vi.fn(async () => ({
      running: false,
      version: "test",
      activeConnections: 0,
      uploadTotal: 0,
      downloadTotal: 0,
      memoryInuse: 0,
    })),
    subscribeStateChanges: mockedState.subscribeStateChanges,
  },
}));

import { useConnectionStore } from "../connection";

async function emitStateChange() {
  if (mockedState.snapshotHandler) {
    await mockedState.snapshotHandler({
      status: mockedState.currentState.status === "connected" ? "connected" : "disconnected",
      mode: mockedState.currentState.mode,
      activeNode: mockedState.currentState.activeNode,
    });
  }
}

describe("useConnectionStore event sync", () => {
  beforeEach(() => {
    mockedState.currentState = {
      status: "disconnected",
      mode: "rule",
      activeNode: null,
      uploadSpeed: 0,
      downloadSpeed: 0,
      totalUpload: 0,
      totalDownload: 0,
      latency: 0,
    };
    mockedState.snapshotHandler = null;
    mockedState.subscribeStateChanges.mockClear();
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

  it("updates connection state directly from a backend snapshot event", async () => {
    const unsubscribe = useConnectionStore.getState().subscribeStateChanges();

    expect(mockedState.subscribeStateChanges).toHaveBeenCalledTimes(1);

    mockedState.currentState = {
      ...mockedState.currentState,
      status: "connected",
      activeNode: "US-West",
    };

    await emitStateChange();

    expect(useConnectionStore.getState().status).toBe("connected");
    expect(useConnectionStore.getState().activeNode).toBe("US-West");

    unsubscribe();
  });
});
