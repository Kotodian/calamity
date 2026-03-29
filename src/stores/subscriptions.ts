import { create } from "zustand";
import { subscriptionsService, type AutoUpdateInterval, type Subscription } from "../services/subscriptions";

interface SubscriptionsStore {
  subscriptions: Subscription[];
  fetchSubscriptions: () => Promise<void>;
  addSubscription: (name: string, url: string) => Promise<void>;
  removeSubscription: (id: string) => Promise<void>;
  updateSubscription: (id: string) => Promise<void>;
  toggleSubscription: (id: string, enabled: boolean) => Promise<void>;
  setAutoUpdateInterval: (id: string, interval: AutoUpdateInterval) => Promise<void>;
}

export const useSubscriptionsStore = create<SubscriptionsStore>((set, get) => ({
  subscriptions: [],

  async fetchSubscriptions() {
    const subscriptions = await subscriptionsService.getSubscriptions();
    set({ subscriptions });
  },
  async addSubscription(name, url) {
    await subscriptionsService.addSubscription({ name, url });
    await get().fetchSubscriptions();
  },
  async removeSubscription(id) {
    await subscriptionsService.removeSubscription(id);
    await get().fetchSubscriptions();
  },
  async updateSubscription(id) {
    await subscriptionsService.updateSubscription(id);
    await get().fetchSubscriptions();
  },
  async toggleSubscription(id, enabled) {
    await subscriptionsService.toggleSubscription(id, enabled);
    await get().fetchSubscriptions();
  },
  async setAutoUpdateInterval(id, interval) {
    await subscriptionsService.setAutoUpdateInterval(id, interval);
    await get().fetchSubscriptions();
  },
}));
