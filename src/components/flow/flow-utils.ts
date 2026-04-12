import type { RouteRule, DnsServer, DnsRule, NodeGroup } from "@/services/types";
import type {
  MatchNode, DnsFlowNode, OutboundFlowNode, FlowEdge,
} from "./flow-types";
import { COLUMN_X, NODE_HEIGHT, NODE_GAP } from "./flow-types";

export function buildMatchNodes(rules: RouteRule[]): MatchNode[] {
  return rules.map((r, i) => ({
    id: `match-${r.id}`,
    type: "match" as const,
    position: { x: COLUMN_X.match, y: i * (NODE_HEIGHT + NODE_GAP) },
    data: {
      kind: "match" as const,
      ruleId: r.id,
      ruleName: r.name,
      matchType: r.matchType,
      matchValue: r.matchValue,
      invert: r.invert,
      enabled: r.enabled,
      ruleSetUrl: r.ruleSetUrl,
      ruleSetLocalPath: r.ruleSetLocalPath,
      order: r.order,
    },
  }));
}

export function buildDnsNodes(servers: DnsServer[]): DnsFlowNode[] {
  return servers
    .filter((s) => s.enabled)
    .map((s, i) => ({
      id: `dns-${s.name}`,
      type: "dns" as const,
      position: { x: COLUMN_X.dns, y: i * (NODE_HEIGHT + NODE_GAP) },
      data: {
        kind: "dns" as const,
        serverName: s.name,
        address: s.address,
        enabled: s.enabled,
        detour: s.detour,
        domainResolver: s.domainResolver,
      },
    }));
}

export function buildOutboundNodes(
  rules: RouteRule[],
  groups: NodeGroup[],
): OutboundFlowNode[] {
  const allNodes = groups.flatMap((g) => g.nodes);
  const nodes: OutboundFlowNode[] = [];
  const seen = new Set<string>();

  for (const fixed of ["direct", "reject", "tailnet"] as const) {
    nodes.push({
      id: `out-${fixed}`,
      type: "outbound" as const,
      position: { x: COLUMN_X.outbound, y: nodes.length * (NODE_HEIGHT + NODE_GAP) },
      data: { kind: "outbound" as const, outboundType: fixed },
    });
    seen.add(fixed);
  }

  for (const proxyNode of allNodes) {
    if (seen.has(proxyNode.name)) continue;
    seen.add(proxyNode.name);
    nodes.push({
      id: `out-proxy-${proxyNode.name}`,
      type: "outbound" as const,
      position: { x: COLUMN_X.outbound, y: nodes.length * (NODE_HEIGHT + NODE_GAP) },
      data: {
        kind: "outbound" as const,
        outboundType: "proxy",
        nodeName: proxyNode.name,
        nodeProtocol: proxyNode.protocol,
        nodeCountryCode: proxyNode.countryCode,
      },
    });
  }

  for (const rule of rules) {
    if (rule.outbound === "proxy" && rule.outboundNode && !seen.has(rule.outboundNode)) {
      seen.add(rule.outboundNode);
      nodes.push({
        id: `out-proxy-${rule.outboundNode}`,
        type: "outbound" as const,
        position: { x: COLUMN_X.outbound, y: nodes.length * (NODE_HEIGHT + NODE_GAP) },
        data: {
          kind: "outbound" as const,
          outboundType: "proxy",
          nodeName: rule.outboundNode,
        },
      });
    }
  }

  return nodes;
}

export function buildEdges(
  rules: RouteRule[],
  dnsRules: DnsRule[],
  dnsServers: DnsServer[],
): FlowEdge[] {
  const edges: FlowEdge[] = [];

  for (const rule of rules) {
    const outTarget =
      rule.outbound === "proxy" && rule.outboundNode
        ? `out-proxy-${rule.outboundNode}`
        : `out-${rule.outbound}`;

    edges.push({
      id: `e-route-${rule.id}`,
      source: `match-${rule.id}`,
      target: outTarget,
      sourceHandle: "route-out",
      targetHandle: "route-in",
      data: { kind: "route" },
      type: "flow",
    });

    const matchingDnsRule = dnsRules.find((dr) => matchesDnsRule(rule, dr));
    const needsDnsEdge = matchingDnsRule && !["ip-cidr", "geoip", "process-name", "process-path", "port", "port-range", "network"].includes(rule.matchType);
    if (needsDnsEdge) {
      edges.push({
        id: `e-dns-${rule.id}-${matchingDnsRule.server}`,
        source: `match-${rule.id}`,
        target: `dns-${matchingDnsRule.server}`,
        sourceHandle: "dns-out",
        targetHandle: "dns-in",
        data: { kind: "dns-resolve" },
        type: "flow",
      });
    }
  }

  for (const server of dnsServers) {
    if (server.detour && server.enabled) {
      edges.push({
        id: `e-detour-${server.name}`,
        source: `dns-${server.name}`,
        target: `out-proxy-${server.detour}`,
        sourceHandle: "detour-out",
        targetHandle: "route-in",
        data: { kind: "dns-detour" },
        type: "flow",
      });
    }
  }

  return edges;
}

export function parseOutboundNodeId(nodeId: string): {
  outbound: string;
  outboundNode?: string;
} {
  if (nodeId.startsWith("out-proxy-")) {
    return { outbound: "proxy", outboundNode: nodeId.replace("out-proxy-", "") };
  }
  return { outbound: nodeId.replace("out-", "") };
}

export function toDnsRuleMatch(
  rule: Pick<RouteRule, "matchType" | "matchValue">,
): Pick<DnsRule, "matchType" | "matchValue"> | null {
  switch (rule.matchType) {
    case "domain-full":
      return { matchType: "domain", matchValue: rule.matchValue };
    case "domain-suffix":
    case "domain-keyword":
    case "domain-regex":
      return { matchType: rule.matchType, matchValue: rule.matchValue };
    case "geosite":
      return { matchType: "rule_set", matchValue: `geosite-${rule.matchValue}` };
    case "rule-set":
      return { matchType: "rule_set", matchValue: `ruleset-${rule.matchValue}` };
    default:
      return null;
  }
}

export function matchesDnsRule(
  rule: Pick<RouteRule, "matchType" | "matchValue">,
  dnsRule: Pick<DnsRule, "enabled" | "matchType" | "matchValue">,
): boolean {
  if (!dnsRule.enabled) return false;

  const expected = toDnsRuleMatch(rule);
  if (!expected) return false;

  if (
    dnsRule.matchType === expected.matchType
    && dnsRule.matchValue.toLowerCase() === expected.matchValue.toLowerCase()
  ) {
    return true;
  }

  return rule.matchType === "rule-set"
    && dnsRule.matchType === "rule_set"
    && dnsRule.matchValue.toLowerCase() === rule.matchValue.toLowerCase();
}
