import { useCallback, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  type OnConnect,
  type NodeTypes,
  type EdgeTypes,
  BackgroundVariant,
} from "@xyflow/react";
import { MatchNodeComponent_Memo } from "./nodes/MatchNode";
import { DnsNodeComponent_Memo } from "./nodes/DnsNode";
import { OutboundNodeComponent_Memo } from "./nodes/OutboundNode";
import { FlowEdgeComponent_Memo } from "./edges/FlowEdge";
import type { FlowNode, FlowEdge } from "./flow-types";

const nodeTypes: NodeTypes = {
  match: MatchNodeComponent_Memo,
  dns: DnsNodeComponent_Memo,
  outbound: OutboundNodeComponent_Memo,
};

const edgeTypes: EdgeTypes = {
  flow: FlowEdgeComponent_Memo,
};

interface FlowCanvasProps {
  initialNodes: FlowNode[];
  initialEdges: FlowEdge[];
  onConnect: OnConnect;
  onNodeDoubleClick?: (event: React.MouseEvent, node: any) => void;
  onEdgesDelete?: (edges: FlowEdge[]) => void;
}

export function FlowCanvas({
  initialNodes,
  initialEdges,
  onConnect,
  onNodeDoubleClick,
  onEdgesDelete,
}: FlowCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useMemo(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  const handleConnect: OnConnect = useCallback(
    (params) => {
      setEdges((eds) => addEdge({ ...params, type: "flow" }, eds));
      onConnect(params);
    },
    [setEdges, onConnect],
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={handleConnect}
      onNodeDoubleClick={onNodeDoubleClick}
      onEdgesDelete={onEdgesDelete}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      fitView
      fitViewOptions={{ padding: 0.2 }}
      defaultEdgeOptions={{ type: "flow" }}
      proOptions={{ hideAttribution: true }}
      className="bg-background"
    >
      <Background
        variant={BackgroundVariant.Dots}
        gap={20}
        size={1}
        color="rgba(255,255,255,0.04)"
      />
      <Controls
        className="!bg-card/80 !border-white/[0.06] !backdrop-blur-xl !rounded-xl [&>button]:!bg-transparent [&>button]:!border-white/[0.06] [&>button]:!text-muted-foreground [&>button:hover]:!text-foreground"
      />
      <MiniMap
        className="!bg-card/60 !border-white/[0.06] !backdrop-blur-xl !rounded-xl"
        nodeColor={(node) => {
          switch (node.type) {
            case "match": return "rgba(254,151,185,0.4)";
            case "dns": return "rgba(96,165,250,0.4)";
            case "outbound": return "rgba(74,222,128,0.4)";
            default: return "rgba(255,255,255,0.1)";
          }
        }}
        maskColor="rgba(0,0,0,0.6)"
      />
    </ReactFlow>
  );
}
