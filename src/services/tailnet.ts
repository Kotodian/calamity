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

// ---- Mock Implementation ----

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

const mockTailnetService: TailnetService = {
  async getAccount() {
    return { ...mockAccount };
  },
  async login() {
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

// ---- Tauri Implementation ----

interface RawTailscaleStatus {
  account: {
    loginName: string;
    tailnetName: string;
    loggedIn: boolean;
  };
  devices: Array<{
    id: string;
    name: string;
    hostname: string;
    ip: string;
    os: string;
    status: string;
    lastSeen: string;
    isExitNode: boolean;
    isCurrentExitNode: boolean;
    isSelf: boolean;
  }>;
}

interface RawFunnelEntry {
  id: string;
  localPort: number;
  protocol: string;
  publicUrl: string;
  enabled: boolean;
  allowPublic: boolean;
}

function createTauriTailnetService(): TailnetService {
  return {
    async getAccount() {
      const { invoke } = await import("@tauri-apps/api/core");
      try {
        const status = await invoke<RawTailscaleStatus>("tailscale_status");
        return {
          loginName: status.account.loginName,
          tailnetName: status.account.tailnetName,
          loggedIn: status.account.loggedIn,
        };
      } catch {
        return { loginName: "", tailnetName: "", loggedIn: false };
      }
    },
    async login() {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke<string>("tailscale_login");
      // Poll for login completion
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        try {
          const status = await invoke<RawTailscaleStatus>("tailscale_status");
          if (status.account.loggedIn) {
            return {
              loginName: status.account.loginName,
              tailnetName: status.account.tailnetName,
              loggedIn: true,
            };
          }
        } catch {
          // continue polling
        }
      }
      throw new Error("Login timed out");
    },
    async logout() {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("tailscale_logout");
    },
    async getDevices() {
      const { invoke } = await import("@tauri-apps/api/core");
      const status = await invoke<RawTailscaleStatus>("tailscale_status");
      return status.devices.map((d) => ({
        id: d.id,
        name: d.name,
        hostname: d.hostname,
        ip: d.ip,
        os: d.os,
        status: d.status as "online" | "offline",
        lastSeen: d.lastSeen,
        isExitNode: d.isExitNode,
        isCurrentExitNode: d.isCurrentExitNode,
        isSelf: d.isSelf,
      }));
    },
    async setExitNode(deviceId) {
      const { invoke } = await import("@tauri-apps/api/core");
      if (deviceId === null) {
        await invoke("tailscale_set_exit_node", { ip: "" });
      } else {
        // deviceId is the node ID, we need the IP
        const status = await invoke<RawTailscaleStatus>("tailscale_status");
        const device = status.devices.find((d) => d.id === deviceId);
        if (!device) throw new Error("Device not found");
        await invoke("tailscale_set_exit_node", { ip: device.ip });
      }
    },
    async getFunnels() {
      const { invoke } = await import("@tauri-apps/api/core");
      const entries = await invoke<RawFunnelEntry[]>("tailscale_get_serve_status");
      return entries.map((e) => ({
        ...e,
        protocol: e.protocol as "https" | "tcp" | "tls-terminated-tcp",
      }));
    },
    async addFunnel(input) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("tailscale_add_funnel", {
        port: input.localPort,
        allowPublic: input.allowPublic,
      });
      // Fetch updated list and return the new entry
      const entries = await invoke<RawFunnelEntry[]>("tailscale_get_serve_status");
      const entry = entries.find((e) => e.localPort === input.localPort);
      if (!entry) throw new Error("Funnel not found after creation");
      return {
        ...entry,
        protocol: entry.protocol as "https" | "tcp" | "tls-terminated-tcp",
      };
    },
    async toggleFunnel(_id, _enabled) {
      // Tailscale CLI doesn't support enable/disable — funnels are either on or off
      // This is a no-op for real implementation
    },
    async removeFunnel(id) {
      const { invoke } = await import("@tauri-apps/api/core");
      // id format: "web-3000" or "tcp-8080"
      const port = parseInt(id.split("-").pop() || "0");
      if (port > 0) {
        await invoke("tailscale_remove_funnel", { port });
      }
    },
  };
}

// ---- Export ----

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
export const tailnetService: TailnetService = isTauri
  ? createTauriTailnetService()
  : mockTailnetService;
