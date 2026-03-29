import type { NodeGroup, ProtocolConfig, ProxyNode } from "./types";

export type NewNodeInput = {
  name: string;
  server: string;
  port: number;
  protocol: string;
  country: string;
  countryCode: string;
  protocolConfig?: ProtocolConfig;
};

export interface NodesService {
  getGroups(): Promise<NodeGroup[]>;
  testLatency(nodeId: string): Promise<number>;
  testAllLatency(groupId: string): Promise<void>;
  setActiveNode(nodeId: string): Promise<void>;
  disconnectNode(): Promise<void>;
  addNode(groupId: string, input: NewNodeInput): Promise<ProxyNode>;
  updateNode(nodeId: string, input: NewNodeInput): Promise<void>;
  removeNode(nodeId: string): Promise<void>;
  addGroup(name: string): Promise<NodeGroup>;
  removeGroup(groupId: string): Promise<void>;
  renameGroup(groupId: string, name: string): Promise<void>;
}

// ---- Mock Implementation ----

const mockNodes: NodeGroup[] = [
  {
    id: "proxy",
    name: "Proxy",
    nodes: [
      { id: "tokyo-01", name: "Tokyo 01", server: "jp1.example.com", port: 443, protocol: "VMess", latency: 32, country: "Japan", countryCode: "JP", active: true },
      { id: "tokyo-02", name: "Tokyo 02", server: "jp2.example.com", port: 443, protocol: "Trojan", latency: 45, country: "Japan", countryCode: "JP", active: false },
      { id: "us-west", name: "US West", server: "us1.example.com", port: 443, protocol: "Shadowsocks", latency: 180, country: "United States", countryCode: "US", active: false },
      { id: "sg-01", name: "Singapore 01", server: "sg1.example.com", port: 443, protocol: "VMess", latency: 68, country: "Singapore", countryCode: "SG", active: false },
      { id: "hk-01", name: "Hong Kong 01", server: "hk1.example.com", port: 443, protocol: "VLESS", latency: 55, country: "Hong Kong", countryCode: "HK", active: false },
      { id: "kr-01", name: "Korea 01", server: "kr1.example.com", port: 443, protocol: "Hysteria2", latency: 40, country: "South Korea", countryCode: "KR", active: false },
    ],
  },
  {
    id: "auto",
    name: "Auto Select",
    nodes: [
      { id: "auto-best", name: "Best Latency", server: "auto", port: 0, protocol: "URLTest", latency: 32, country: "Japan", countryCode: "JP", active: false },
    ],
  },
];

function cloneNodes(): NodeGroup[] {
  return mockNodes.map((g) => ({ ...g, nodes: g.nodes.map((n) => ({ ...n })) }));
}

function findNode(nodeId: string): ProxyNode | undefined {
  for (const group of mockNodes) {
    const node = group.nodes.find((n) => n.id === nodeId);
    if (node) return node;
  }
  return undefined;
}

const mockNodesService: NodesService = {
  async getGroups() {
    return cloneNodes();
  },
  async testLatency(nodeId: string) {
    const latency = Math.floor(Math.random() * 200) + 20;
    const node = findNode(nodeId);
    if (node) node.latency = latency;
    return latency;
  },
  async testAllLatency() {
    for (const group of mockNodes) {
      for (const node of group.nodes) {
        node.latency = Math.floor(Math.random() * 200) + 20;
      }
    }
  },
  async setActiveNode(nodeId: string) {
    for (const group of mockNodes) {
      for (const node of group.nodes) {
        node.active = node.id === nodeId;
      }
    }
  },
  async disconnectNode() {
    for (const group of mockNodes) {
      for (const node of group.nodes) {
        node.active = false;
      }
    }
  },
  async addNode(groupId: string, input: NewNodeInput) {
    const group = mockNodes.find((g) => g.id === groupId);
    if (!group) throw new Error(`Group ${groupId} not found`);
    const newNode: ProxyNode = {
      id: `custom-${Date.now()}`,
      ...input,
      latency: null,
      active: false,
    };
    group.nodes.push(newNode);
    return { ...newNode };
  },
  async updateNode(nodeId: string, input: NewNodeInput) {
    for (const group of mockNodes) {
      const node = group.nodes.find((n) => n.id === nodeId);
      if (node) {
        Object.assign(node, input);
        return;
      }
    }
  },
  async removeNode(nodeId: string) {
    for (const group of mockNodes) {
      const idx = group.nodes.findIndex((n) => n.id === nodeId);
      if (idx !== -1) {
        group.nodes.splice(idx, 1);
        return;
      }
    }
  },
  async addGroup(name: string) {
    const group: NodeGroup = { id: `group-${Date.now()}`, name, nodes: [] };
    mockNodes.push(group);
    return { ...group };
  },
  async removeGroup(groupId: string) {
    const idx = mockNodes.findIndex((g) => g.id === groupId);
    if (idx !== -1) mockNodes.splice(idx, 1);
  },
  async renameGroup(groupId: string, name: string) {
    const group = mockNodes.find((g) => g.id === groupId);
    if (group) group.name = name;
  },
};

// ---- Tauri Implementation ----

interface RawNodesData {
  groups: Array<{
    id: string;
    name: string;
    groupType: string;
    nodes: Array<{
      id: string;
      name: string;
      server: string;
      port: number;
      protocol: string;
      country: string;
      countryCode: string;
      protocolConfig?: ProtocolConfig;
    }>;
  }>;
  activeNode: string | null;
}

function toNodeGroups(raw: RawNodesData): NodeGroup[] {
  return raw.groups.map((g) => ({
    id: g.id,
    name: g.name,
    nodes: g.nodes.map((n) => ({
      ...n,
      id: n.name,
      latency: null,
      active: raw.activeNode === n.name,
    })),
  }));
}

function createTauriNodesService(): NodesService {
  return {
    async getGroups() {
      const { invoke } = await import("@tauri-apps/api/core");
      const raw = await invoke<RawNodesData>("get_nodes");
      return toNodeGroups(raw);
    },
    async testLatency(nodeId) {
      const { invoke } = await import("@tauri-apps/api/core");
      return invoke<number>("test_node_latency", { nodeName: nodeId });
    },
    async testAllLatency(groupId) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("test_group_latency", { groupId });
    },
    async setActiveNode(nodeId) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("set_active_node", { nodeName: nodeId });
    },
    async disconnectNode() {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("disconnect_node");
    },
    async addNode(groupId, input) {
      const { invoke } = await import("@tauri-apps/api/core");
      const node = {
        id: input.name,
        name: input.name,
        server: input.server,
        port: input.port,
        protocol: input.protocol,
        country: input.country,
        countryCode: input.countryCode,
        protocolConfig: input.protocolConfig ?? null,
      };
      const raw = await invoke<RawNodesData>("add_node", { groupId, node });
      const groups = toNodeGroups(raw);
      const group = groups.find((g) => g.id === groupId);
      return group?.nodes[group.nodes.length - 1] ?? { ...input, id: node.id, latency: null, active: false };
    },
    async updateNode(nodeId, input) {
      const { invoke } = await import("@tauri-apps/api/core");
      const node = {
        id: input.name,
        name: input.name,
        server: input.server,
        port: input.port,
        protocol: input.protocol,
        country: input.country,
        countryCode: input.countryCode,
        protocolConfig: input.protocolConfig ?? null,
      };
      await invoke("update_node", { oldName: nodeId, node });
    },
    async removeNode(nodeId) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("remove_node", { nodeName: nodeId });
    },
    async addGroup(name) {
      const { invoke } = await import("@tauri-apps/api/core");
      const raw = await invoke<RawNodesData>("add_group", { name });
      const groups = toNodeGroups(raw);
      return groups[groups.length - 1];
    },
    async removeGroup(groupId) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("remove_group", { groupId });
    },
    async renameGroup(groupId, name) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("rename_group", { groupId, name });
    },
  };
}

// ---- Export ----

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
export const nodesService: NodesService = isTauri ? createTauriNodesService() : mockNodesService;
