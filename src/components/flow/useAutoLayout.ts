import { useCallback } from "react";
import type { FlowNode } from "./flow-types";
import { COLUMN_X, NODE_HEIGHT, NODE_GAP } from "./flow-types";

export function useAutoLayout() {
  const layout = useCallback((nodes: FlowNode[]): FlowNode[] => {
    const columns: Record<string, FlowNode[]> = {
      match: [],
      dns: [],
      outbound: [],
    };

    for (const node of nodes) {
      if (node.type === "match") columns.match.push(node);
      else if (node.type === "dns") columns.dns.push(node);
      else if (node.type === "outbound") columns.outbound.push(node);
    }

    const result: FlowNode[] = [];

    for (const [col, colNodes] of Object.entries(columns)) {
      const x = COLUMN_X[col as keyof typeof COLUMN_X];
      for (let i = 0; i < colNodes.length; i++) {
        result.push({
          ...colNodes[i],
          position: { x, y: i * (NODE_HEIGHT + NODE_GAP) },
        });
      }
    }

    return result;
  }, []);

  return layout;
}
