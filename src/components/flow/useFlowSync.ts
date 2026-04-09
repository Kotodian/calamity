import { useState, useEffect, useCallback } from "react";
import type { Connection } from "@xyflow/react";
import { useRulesStore } from "@/stores/rules";
import { useDnsStore } from "@/stores/dns";
import { useNodesStore } from "@/stores/nodes";
import type { FlowNode, FlowEdge } from "./flow-types";
import {
  buildMatchNodes,
  buildDnsNodes,
  buildOutboundNodes,
  buildEdges,
  parseOutboundNodeId,
} from "./flow-utils";
import { useAutoLayout } from "./useAutoLayout";

export function useFlowSync() {
  const rules = useRulesStore((s) => s.rules);
  const fetchRules = useRulesStore((s) => s.fetchRules);
  const updateRule = useRulesStore((s) => s.updateRule);

  const dnsConfig = useDnsStore((s) => s.config);
  const dnsRules = useDnsStore((s) => s.rules);
  const fetchDns = useDnsStore((s) => s.fetchAll);

  const groups = useNodesStore((s) => s.groups);
  const fetchGroups = useNodesStore((s) => s.fetchGroups);

  const layout = useAutoLayout();

  const [nodes, setNodes] = useState<FlowNode[]>([]);
  const [edges, setEdges] = useState<FlowEdge[]>([]);
  const [initialized, setInitialized] = useState(false);

  // Load all data on mount
  useEffect(() => {
    Promise.all([fetchRules(), fetchDns(), fetchGroups()]);
  }, [fetchRules, fetchDns, fetchGroups]);

  // Rebuild nodes/edges when store data changes
  useEffect(() => {
    if (!rules.length && !dnsConfig) return;

    const matchNodes = buildMatchNodes(rules);
    const dnsNodes = buildDnsNodes(dnsConfig?.servers ?? []);
    const outboundNodes = buildOutboundNodes(rules, groups);
    const allNodes = [...matchNodes, ...dnsNodes, ...outboundNodes] as FlowNode[];

    const allEdges = buildEdges(rules, dnsRules, dnsConfig?.servers ?? []);

    if (!initialized) {
      setNodes(layout(allNodes));
      setInitialized(true);
    } else {
      // Preserve positions for existing nodes, layout new ones
      setNodes((prev) => {
        const posMap = new Map(prev.map((n) => [n.id, n.position]));
        return allNodes.map((n) => ({
          ...n,
          position: posMap.get(n.id) ?? n.position,
        }));
      });
    }
    setEdges(allEdges);
  }, [rules, dnsConfig, dnsRules, groups, layout, initialized]);

  // Handle new connection: match → outbound
  const onConnect = useCallback(
    (connection: Connection) => {
      const { source, target, sourceHandle } = connection;
      if (!source || !target) return;

      if (sourceHandle === "route-out" && target.startsWith("out-")) {
        const ruleId = source.replace("match-", "");
        const { outbound, outboundNode } = parseOutboundNodeId(target);
        updateRule(ruleId, { outbound: outbound as any, outboundNode });
      }
    },
    [updateRule],
  );

  const doAutoLayout = useCallback(() => {
    setNodes((prev) => layout(prev));
  }, [layout]);

  return {
    nodes,
    edges,
    setNodes,
    setEdges,
    onConnect,
    doAutoLayout,
  };
}
