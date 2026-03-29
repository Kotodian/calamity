import { create } from "zustand";
import { tailnetService, type TailnetAccount } from "../services/tailnet";
import type { TailnetDevice } from "../services/types";

interface TailnetStore {
  account: TailnetAccount | null;
  devices: TailnetDevice[];
  loggingIn: boolean;
  fetchAccount: () => Promise<void>;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  fetchDevices: () => Promise<void>;
  setExitNode: (deviceId: string | null) => Promise<void>;
}

export const useTailnetStore = create<TailnetStore>((set, get) => ({
  account: null,
  devices: [],
  loggingIn: false,

  async fetchAccount() {
    const account = await tailnetService.getAccount();
    set({ account });
  },
  async login() {
    set({ loggingIn: true });
    const account = await tailnetService.login();
    set({ account, loggingIn: false });
    await get().fetchDevices();
  },
  async logout() {
    await tailnetService.logout();
    set({ account: { loginName: "", tailnetName: "", loggedIn: false }, devices: [] });
  },
  async fetchDevices() {
    const devices = await tailnetService.getDevices();
    set({ devices });
  },
  async setExitNode(deviceId) {
    await tailnetService.setExitNode(deviceId);
    await get().fetchDevices();
  },
}));
