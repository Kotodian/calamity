import type { ConnectionSnapshot, ConnectionState, ProxyMode } from "./types";

export interface DashboardInfo {
  running: boolean;
  version: string;
  activeConnections: number;
  uploadTotal: number;
  downloadTotal: number;
  memoryInuse: number;
}

export interface ConnectionService {
  getState(): Promise<ConnectionState>;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  setMode(mode: ProxyMode): Promise<void>;
  subscribeTraffic(onUpdate: (up: number, down: number) => void): () => void;
  subscribeStateChanges(onChange: (snapshot: ConnectionSnapshot) => void | Promise<void>): () => void;
  getDashboardInfo(): Promise<DashboardInfo>;
}

export function buildConnectionSnapshot(input: {
  running: boolean;
  activeNode: string | null;
  proxyMode?: string | null;
}): ConnectionSnapshot {
  return {
    status: input.running ? "connected" : "disconnected",
    mode: (input.proxyMode || "rule") as ProxyMode,
    activeNode: input.activeNode,
  };
}

function createTauriConnectionService(): ConnectionService {
  return {
    async getState() {
      const { invoke } = await import("@tauri-apps/api/core");
      const [status, nodesData, settings] = await Promise.all([
        invoke<{ running: boolean; version: string }>("singbox_status"),
        invoke<{ activeNode: string | null }>("get_nodes"),
        invoke<{ proxyMode?: string }>("get_settings"),
      ]);
      const snapshot = buildConnectionSnapshot({
        running: status.running,
        activeNode: nodesData.activeNode,
        proxyMode: settings.proxyMode,
      });

      return {
        status: snapshot.status,
        mode: snapshot.mode,
        activeNode: snapshot.activeNode,
        uploadSpeed: 0,
        downloadSpeed: 0,
        totalUpload: 0,
        totalDownload: 0,
        latency: 0,
      };
    },

    async connect() {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("singbox_start");
    },

    async disconnect() {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("singbox_stop");
    },

    async setMode() {
      // Mode is persisted via update_settings in the store
    },

    subscribeTraffic(onUpdate) {
      let unlisten: (() => void) | null = null;
      let cancelled = false;

      (async () => {
        try {
          const { invoke } = await import("@tauri-apps/api/core");
          const { listen } = await import("@tauri-apps/api/event");

          unlisten = await listen<{ up: number; down: number }>("traffic-update", (event) => {
            if (!cancelled) {
              onUpdate(event.payload.up, event.payload.down);
            }
          });

          await invoke("subscribe_traffic");
        } catch (e) {
          console.error("[traffic] subscribe failed:", e);
        }
      })();

      return () => {
        cancelled = true;
        if (unlisten) unlisten();
      };
    },

    subscribeStateChanges(onChange) {
      let unlistenConnectionState: (() => void) | null = null;
      let cancelled = false;

      (async () => {
        try {
          const { listen } = await import("@tauri-apps/api/event");
          unlistenConnectionState = await listen<ConnectionSnapshot>("connection-state-changed", async (event) => {
            if (!cancelled) {
              await onChange(event.payload);
            }
          });
        } catch (e) {
          console.error("[connection] state sync subscribe failed:", e);
        }
      })();

      return () => {
        cancelled = true;
        if (unlistenConnectionState) unlistenConnectionState();
      };
    },

    async getDashboardInfo() {
      const { invoke } = await import("@tauri-apps/api/core");
      return invoke<DashboardInfo>("get_dashboard_info");
    },
  };
}

function createMockConnectionService(): ConnectionService {
  return {
    async getState() {
      return {
        status: "disconnected" as const,
        mode: "rule" as ProxyMode,
        activeNode: null,
        uploadSpeed: 0,
        downloadSpeed: 0,
        totalUpload: 0,
        totalDownload: 0,
        latency: 0,
      };
    },
    async connect() {},
    async disconnect() {},
    async setMode() {},
    subscribeTraffic() { return () => {}; },
    subscribeStateChanges() { return () => {}; },
    async getDashboardInfo() {
      return { running: false, version: "mock", activeConnections: 0, uploadTotal: 0, downloadTotal: 0, memoryInuse: 0 };
    },
  };
}

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
export const connectionService: ConnectionService = isTauri
  ? createTauriConnectionService()
  : createMockConnectionService();
