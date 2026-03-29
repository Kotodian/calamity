import type { TailnetDevice } from "./types";

export interface TailnetAccount {
  loginName: string;
  tailnetName: string;
  profilePicUrl?: string;
  loggedIn: boolean;
}

export interface FunnelEntry {
  id: string;
  localPort: number;
  protocol: "https" | "tcp" | "tls-terminated-tcp";
  publicUrl: string;
  enabled: boolean;
  allowPublic: boolean;
}

export type NewFunnelInput = {
  localPort: number;
  protocol: "https" | "tcp" | "tls-terminated-tcp";
  allowPublic: boolean;
};

export interface TailnetService {
  getAccount(): Promise<TailnetAccount>;
  login(): Promise<TailnetAccount>;
  logout(): Promise<void>;
  getDevices(): Promise<TailnetDevice[]>;
  setExitNode(deviceId: string | null): Promise<void>;
  getFunnels(): Promise<FunnelEntry[]>;
  addFunnel(input: NewFunnelInput): Promise<FunnelEntry>;
  toggleFunnel(id: string, enabled: boolean): Promise<void>;
  removeFunnel(id: string): Promise<void>;
}

let mockAccount: TailnetAccount = {
  loginName: "",
  tailnetName: "",
  loggedIn: false,
};

const mockDevices: TailnetDevice[] = [
  { id: "d1", name: "MacBook Pro", hostname: "macbook-pro", ip: "100.64.0.1", os: "macOS", status: "online", lastSeen: new Date().toISOString(), isExitNode: false, isCurrentExitNode: false, isSelf: true },
  { id: "d2", name: "Home Server", hostname: "homelab-nas", ip: "100.64.0.2", os: "Linux", status: "online", lastSeen: new Date().toISOString(), isExitNode: true, isCurrentExitNode: false, isSelf: false },
  { id: "d3", name: "Office Desktop", hostname: "office-pc", ip: "100.64.0.3", os: "Windows", status: "online", lastSeen: new Date().toISOString(), isExitNode: true, isCurrentExitNode: false, isSelf: false },
  { id: "d4", name: "Raspberry Pi", hostname: "rpi-gateway", ip: "100.64.0.4", os: "Linux", status: "offline", lastSeen: new Date(Date.now() - 86400000).toISOString(), isExitNode: true, isCurrentExitNode: false, isSelf: false },
  { id: "d5", name: "iPhone", hostname: "iphone", ip: "100.64.0.5", os: "iOS", status: "online", lastSeen: new Date().toISOString(), isExitNode: false, isCurrentExitNode: false, isSelf: false },
];

let mockFunnels: FunnelEntry[] = [];

export const tailnetService: TailnetService = {
  async getAccount() {
    return { ...mockAccount };
  },
  async login() {
    // Mock: simulate Tailscale login
    await new Promise((r) => setTimeout(r, 1000));
    mockAccount = {
      loginName: "user@example.com",
      tailnetName: "example.ts.net",
      loggedIn: true,
    };
    return { ...mockAccount };
  },
  async logout() {
    mockAccount = { loginName: "", tailnetName: "", loggedIn: false };
  },
  async getDevices() {
    return mockDevices.map((d) => ({ ...d }));
  },
  async setExitNode(deviceId) {
    for (const d of mockDevices) {
      d.isCurrentExitNode = d.id === deviceId;
    }
  },
  async getFunnels() {
    return mockFunnels.map((f) => ({ ...f }));
  },
  async addFunnel(input) {
    const entry: FunnelEntry = {
      id: `funnel-${Date.now()}`,
      localPort: input.localPort,
      protocol: input.protocol,
      publicUrl: `https://${mockAccount.tailnetName?.replace(".ts.net", "") || "device"}.ts.net:${input.localPort}`,
      enabled: true,
      allowPublic: input.allowPublic,
    };
    mockFunnels.push(entry);
    return { ...entry };
  },
  async toggleFunnel(id, enabled) {
    const f = mockFunnels.find((f) => f.id === id);
    if (f) f.enabled = enabled;
  },
  async removeFunnel(id) {
    const idx = mockFunnels.findIndex((f) => f.id === id);
    if (idx !== -1) mockFunnels.splice(idx, 1);
  },
};
