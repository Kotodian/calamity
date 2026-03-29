import { create } from "zustand";
import { nodesService, type NewNodeInput } from "../services/nodes";
import type { NodeGroup } from "../services/types";

interface NodesStore {
  groups: NodeGroup[];
  selectedGroup: string;
  testing: boolean;
  fetchGroups: () => Promise<void>;
  selectGroup: (groupId: string) => void;
  testLatency: (nodeId: string) => Promise<void>;
  testAllLatency: () => Promise<void>;
  setActiveNode: (nodeId: string) => Promise<void>;
  addNode: (groupId: string, input: NewNodeInput) => Promise<void>;
  removeNode: (nodeId: string) => Promise<void>;
}

export const useNodesStore = create<NodesStore>((set, get) => ({
  groups: [],
  selectedGroup: "proxy",
  testing: false,

  async fetchGroups() {
    const groups = await nodesService.getGroups();
    set({ groups });
  },
  selectGroup(groupId) {
    set({ selectedGroup: groupId });
  },
  async testLatency(nodeId) {
    await nodesService.testLatency(nodeId);
    await get().fetchGroups();
  },
  async testAllLatency() {
    set({ testing: true });
    await nodesService.testAllLatency(get().selectedGroup);
    await get().fetchGroups();
    set({ testing: false });
  },
  async setActiveNode(nodeId) {
    await nodesService.setActiveNode(nodeId);
    await get().fetchGroups();
  },
  async addNode(groupId, input) {
    await nodesService.addNode(groupId, input);
    await get().fetchGroups();
  },
  async removeNode(nodeId) {
    await nodesService.removeNode(nodeId);
    await get().fetchGroups();
  },
}));
