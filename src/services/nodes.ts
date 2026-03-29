import type { NodeGroup, ProxyNode } from "./types";

export type NewNodeInput = {
  name: string;
  server: string;
  port: number;
  protocol: string;
  country: string;
  countryCode: string;
};

export interface NodesService {
  getGroups(): Promise<NodeGroup[]>;
  testLatency(nodeId: string): Promise<number>;
  testAllLatency(groupId: string): Promise<void>;
  setActiveNode(nodeId: string): Promise<void>;
  addNode(groupId: string, input: NewNodeInput): Promise<ProxyNode>;
  removeNode(nodeId: string): Promise<void>;
}

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

export const nodesService: NodesService = {
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
  async removeNode(nodeId: string) {
    for (const group of mockNodes) {
      const idx = group.nodes.findIndex((n) => n.id === nodeId);
      if (idx !== -1) {
        group.nodes.splice(idx, 1);
        return;
      }
    }
  },
};
