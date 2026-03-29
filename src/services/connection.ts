import type { ConnectionState, ProxyMode, SpeedRecord } from "./types";

export interface ConnectionService {
  getState(): Promise<ConnectionState>;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  setMode(mode: ProxyMode): Promise<void>;
  getSpeedHistory(minutes: number): Promise<SpeedRecord[]>;
}

let mockState: ConnectionState = {
  status: "connected",
  mode: "rule",
  activeNode: "Tokyo 01",
  uploadSpeed: 2.4 * 1024 * 1024,
  downloadSpeed: 15.7 * 1024 * 1024,
  totalUpload: 0.3 * 1024 * 1024 * 1024,
  totalDownload: 1.2 * 1024 * 1024 * 1024,
  latency: 32,
};

function generateSpeedHistory(minutes: number): SpeedRecord[] {
  const records: SpeedRecord[] = [];
  const now = Date.now();
  for (let i = minutes; i >= 0; i--) {
    const time = new Date(now - i * 60000);
    records.push({
      time: time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      upload: Math.random() * 2 * 1024 * 1024,
      download: Math.random() * 15 * 1024 * 1024,
    });
  }
  return records;
}

export const connectionService: ConnectionService = {
  async getState() {
    return { ...mockState };
  },
  async connect() {
    mockState.status = "connected";
  },
  async disconnect() {
    mockState.status = "disconnected";
  },
  async setMode(mode: ProxyMode) {
    mockState.mode = mode;
  },
  async getSpeedHistory(minutes: number) {
    return generateSpeedHistory(minutes);
  },
};
