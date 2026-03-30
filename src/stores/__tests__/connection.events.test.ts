import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectionState } from "@/services/types";

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
  stateChangeHandler: null as (() => void | Promise<void>) | null,
  subscribeStateChanges: vi.fn((onChange: () => void | Promise<void>) => {
    mockedState.stateChangeHandler = onChange;
    return () => {
      mockedState.stateChangeHandler = null;
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
  if (mockedState.stateChangeHandler) {
    await mockedState.stateChangeHandler();
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
    mockedState.stateChangeHandler = null;
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

  it("refreshes connection state when a backend sync event arrives", async () => {
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
