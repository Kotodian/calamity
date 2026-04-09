import { useState, useCallback } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "@/components/flow/flow-overrides.css";
import { LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FlowCanvas } from "@/components/flow/FlowCanvas";
import { NodeAddPanel } from "@/components/flow/panels/NodeAddPanel";
import { NodeEditPanel } from "@/components/flow/panels/NodeEditPanel";
import { useFlowSync } from "@/components/flow/useFlowSync";
import type { FlowNode } from "@/components/flow/flow-types";
import { useTranslation } from "react-i18next";

function FlowEditorInner() {
  const { t } = useTranslation();
  const { nodes, edges, onConnect, doAutoLayout } = useFlowSync();
  const [selectedNode, setSelectedNode] = useState<FlowNode | null>(null);

  const handleNodeDoubleClick = useCallback(
    (_event: React.MouseEvent, node: FlowNode) => {
      setSelectedNode(node);
    },
    [],
  );

  return (
    <div className="h-full w-full relative">
      {/* Toolbar */}
      <div className="absolute top-4 left-4 z-50 flex items-center gap-2">
        <NodeAddPanel />
        <Button
          size="sm"
          variant="outline"
          className="text-xs gap-1.5 border-white/[0.06]"
          onClick={doAutoLayout}
        >
          <LayoutGrid className="h-3.5 w-3.5" />
          {t("flow.autoLayout")}
        </Button>
      </div>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 z-50 flex items-center gap-4 rounded-xl border border-white/[0.06] bg-card/60 backdrop-blur-xl px-3 py-2">
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-0.5 bg-pink-400/60 rounded" />
          <span className="text-[10px] text-muted-foreground">{t("flow.route")}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-0.5 bg-blue-400/60 rounded" />
          <span className="text-[10px] text-muted-foreground">{t("flow.dnsResolve")}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-0.5 bg-purple-400/50 rounded" style={{ borderTop: "1px dashed rgba(168,85,247,0.5)" }} />
          <span className="text-[10px] text-muted-foreground">{t("flow.dnsDetour")}</span>
        </div>
      </div>

      {/* Canvas */}
      <FlowCanvas
        initialNodes={nodes}
        initialEdges={edges}
        onConnect={onConnect}
        onNodeDoubleClick={handleNodeDoubleClick}
      />

      {/* Edit panel */}
      <NodeEditPanel node={selectedNode} onClose={() => setSelectedNode(null)} />
    </div>
  );
}

export default function FlowEditorPage() {
  return (
    <ReactFlowProvider>
      <FlowEditorInner />
    </ReactFlowProvider>
  );
}
