import type { Node, Edge } from "@xyflow/react";
import type { RouteRule, OutboundType } from "@/services/types";

export interface MatchNodeData {
  kind: "match";
  ruleId: string;
  matchType: RouteRule["matchType"];
  matchValue: string;
  invert?: boolean;
  enabled: boolean;
  ruleSetUrl?: string;
  ruleSetLocalPath?: string;
  order: number;
  [key: string]: unknown;
}

export interface DnsNodeData {
  kind: "dns";
  serverName: string;
  address: string;
  enabled: boolean;
  domainResolver?: string;
  [key: string]: unknown;
}

export interface OutboundNodeData {
  kind: "outbound";
  outboundType: OutboundType | "dns-detour";
  nodeName?: string;
  nodeProtocol?: string;
  nodeCountryCode?: string;
  [key: string]: unknown;
}

export type MatchNode = Node<MatchNodeData, "match">;
export type DnsFlowNode = Node<DnsNodeData, "dns">;
export type OutboundFlowNode = Node<OutboundNodeData, "outbound">;
export type FlowNode = MatchNode | DnsFlowNode | OutboundFlowNode;

export type EdgeKind = "route" | "dns-resolve" | "dns-detour";

export interface FlowEdgeData {
  kind: EdgeKind;
  [key: string]: unknown;
}

export type FlowEdge = Edge<FlowEdgeData>;

export const COLUMN_X = {
  match: 0,
  dns: 450,
  outbound: 900,
} as const;

export const NODE_HEIGHT = 80;
export const NODE_GAP = 16;
