import { create } from "zustand";
import { nodesService, type NewNodeInput } from "../services/nodes";
import type { NodeGroup } from "../services/types";

interface NodesStore {
  groups: NodeGroup[];
  selectedGroup: string;
  testing: boolean;
  latencyMap: Record<string, number>;
  testingNodes: Set<string>;
  fetchGroups: () => Promise<void>;
  selectGroup: (groupId: string) => void;
  testLatency: (nodeId: string) => Promise<void>;
  testAllLatency: () => Promise<void>;
  setActiveNode: (nodeId: string) => Promise<void>;
  disconnectNode: () => Promise<void>;
  addNode: (groupId: string, input: NewNodeInput) => Promise<void>;
  updateNode: (nodeId: string, input: NewNodeInput) => Promise<void>;
  removeNode: (nodeId: string) => Promise<void>;
  addGroup: (name: string) => Promise<void>;
  removeGroup: (groupId: string) => Promise<void>;
  renameGroup: (groupId: string, name: string) => Promise<void>;
}

function applyLatency(groups: NodeGroup[], latencyMap: Record<string, number>): NodeGroup[] {
  return groups.map((g) => ({
    ...g,
    nodes: g.nodes.map((n) => ({
      ...n,
      latency: latencyMap[n.id] ?? n.latency,
    })),
  }));
}

export const useNodesStore = create<NodesStore>((set, get) => ({
  groups: [],
  selectedGroup: "proxy",
  testing: false,
  latencyMap: {},
  testingNodes: new Set(),

  async fetchGroups() {
    const groups = await nodesService.getGroups();
    set({ groups: applyLatency(groups, get().latencyMap) });
  },
  selectGroup(groupId) {
    set({ selectedGroup: groupId });
  },
  async testLatency(nodeId) {
    const testingNodes = new Set(get().testingNodes);
    testingNodes.add(nodeId);
    set({ testingNodes });
    try {
      const latency = await nodesService.testLatency(nodeId);
      const latencyMap = { ...get().latencyMap, [nodeId]: latency };
      const next = new Set(get().testingNodes);
      next.delete(nodeId);
      set({ latencyMap, testingNodes: next, groups: applyLatency(get().groups, latencyMap) });
    } catch {
      const latencyMap = { ...get().latencyMap, [nodeId]: -1 };
      const next = new Set(get().testingNodes);
      next.delete(nodeId);
      set({ latencyMap, testingNodes: next, groups: applyLatency(get().groups, latencyMap) });
    }
  },
  async testAllLatency() {
    set({ testing: true });
    const group = get().groups.find((g) => g.id === get().selectedGroup);
    if (group) {
      await Promise.all(group.nodes.map((n) => get().testLatency(n.id)));
    }
    set({ testing: false });
  },
  async setActiveNode(nodeId) {
    await nodesService.setActiveNode(nodeId);
    await get().fetchGroups();
  },
  async disconnectNode() {
    await nodesService.disconnectNode();
    await get().fetchGroups();
  },
  async addNode(groupId, input) {
    await nodesService.addNode(groupId, input);
    await get().fetchGroups();
  },
  async updateNode(nodeId, input) {
    await nodesService.updateNode(nodeId, input);
    await get().fetchGroups();
  },
  async removeNode(nodeId) {
    await nodesService.removeNode(nodeId);
    await get().fetchGroups();
  },
  async addGroup(name) {
    await nodesService.addGroup(name);
    await get().fetchGroups();
  },
  async removeGroup(groupId) {
    await nodesService.removeGroup(groupId);
    await get().fetchGroups();
  },
  async renameGroup(groupId, name) {
    await nodesService.renameGroup(groupId, name);
    await get().fetchGroups();
  },
}));
