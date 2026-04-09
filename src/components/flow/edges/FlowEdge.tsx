import { memo } from "react";
import { BaseEdge, getSmoothStepPath, type EdgeProps } from "@xyflow/react";
import type { FlowEdgeData } from "../flow-types";

const edgeColor: Record<string, string> = {
  route: "rgba(254,151,185,0.6)",
  "dns-resolve": "rgba(96,165,250,0.6)",
  "dns-detour": "rgba(168,85,247,0.5)",
};

function FlowEdgeComponent(props: EdgeProps<FlowEdgeData>) {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data } = props;

  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 12,
  });

  const color = edgeColor[data?.kind ?? "route"];

  return (
    <BaseEdge
      {...props}
      path={edgePath}
      style={{
        stroke: color,
        strokeWidth: 2,
        strokeDasharray: data?.kind === "dns-detour" ? "6 4" : undefined,
      }}
    />
  );
}

export const FlowEdgeComponent_Memo = memo(FlowEdgeComponent);
