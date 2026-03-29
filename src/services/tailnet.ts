import type { TailnetDevice } from "./types";

export interface TailnetAccount {
  loginName: string;
  tailnetName: string;
  profilePicUrl?: string;
  loggedIn: boolean;
}

export interface TailnetService {
  getAccount(): Promise<TailnetAccount>;
  login(): Promise<TailnetAccount>;
  logout(): Promise<void>;
  getDevices(): Promise<TailnetDevice[]>;
  setExitNode(deviceId: string | null): Promise<void>;
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
};
