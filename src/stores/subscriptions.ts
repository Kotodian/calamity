import { create } from "zustand";
import { subscriptionsService, type Subscription } from "../services/subscriptions";

interface SubscriptionsStore {
  subscriptions: Subscription[];
  fetchSubscriptions: () => Promise<void>;
  addSubscription: (name: string, url: string, autoUpdateInterval?: number) => Promise<void>;
  removeSubscription: (id: string) => Promise<void>;
  updateSubscription: (id: string) => Promise<void>;
  updateAllSubscriptions: () => Promise<void>;
  toggleSubscription: (id: string, enabled: boolean) => Promise<void>;
  editSubscription: (id: string, updates: { name?: string; url?: string; autoUpdateInterval?: number }) => Promise<void>;
}

export const useSubscriptionsStore = create<SubscriptionsStore>((set, get) => ({
  subscriptions: [],

  async fetchSubscriptions() {
    const subscriptions = await subscriptionsService.getSubscriptions();
    set({ subscriptions });
  },
  async addSubscription(name, url, autoUpdateInterval) {
    await subscriptionsService.addSubscription({ name, url, autoUpdateInterval });
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
  async updateAllSubscriptions() {
    await subscriptionsService.updateAllSubscriptions();
    await get().fetchSubscriptions();
  },
  async toggleSubscription(id, enabled) {
    await subscriptionsService.toggleSubscription(id, enabled);
    await get().fetchSubscriptions();
  },
  async editSubscription(id, updates) {
    await subscriptionsService.editSubscription(id, updates);
    await get().fetchSubscriptions();
  },
}));
