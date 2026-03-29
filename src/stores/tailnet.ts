import { create } from "zustand";
import { tailnetService, type TailnetAccount, type FunnelEntry, type NewFunnelInput } from "../services/tailnet";
import type { TailnetDevice } from "../services/types";

interface TailnetStore {
  account: TailnetAccount | null;
  devices: TailnetDevice[];
  funnels: FunnelEntry[];
  loggingIn: boolean;
  fetchAccount: () => Promise<void>;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  fetchDevices: () => Promise<void>;
  setExitNode: (deviceId: string | null) => Promise<void>;
  fetchFunnels: () => Promise<void>;
  addFunnel: (input: NewFunnelInput) => Promise<void>;
  toggleFunnel: (id: string, enabled: boolean) => Promise<void>;
  removeFunnel: (id: string) => Promise<void>;
}

export const useTailnetStore = create<TailnetStore>((set, get) => ({
  account: null,
  devices: [],
  funnels: [],
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
  async fetchFunnels() {
    const funnels = await tailnetService.getFunnels();
    set({ funnels });
  },
  async addFunnel(input) {
    await tailnetService.addFunnel(input);
    await get().fetchFunnels();
  },
  async toggleFunnel(id, enabled) {
    await tailnetService.toggleFunnel(id, enabled);
    await get().fetchFunnels();
  },
  async removeFunnel(id) {
    await tailnetService.removeFunnel(id);
    await get().fetchFunnels();
  },
}));
