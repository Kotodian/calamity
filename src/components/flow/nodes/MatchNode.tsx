import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MatchNodeData } from "../flow-types";

function MatchNodeComponent({ data, selected }: NodeProps<MatchNodeData>) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-card/60 backdrop-blur-xl px-4 py-3 min-w-[200px] transition-all",
        selected ? "border-primary shadow-[0_0_12px_rgba(254,151,185,0.3)]" : "border-white/[0.06]",
        !data.enabled && "opacity-40",
      )}
    >
      <div className="flex items-center gap-2">
        <Filter className="h-3.5 w-3.5 text-pink-400 shrink-0" />
        <div className="min-w-0">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
            {data.matchType}
            {data.invert ? " (NOT)" : ""}
          </p>
          <p className="text-xs font-medium truncate">{data.matchValue}</p>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        id="route-out"
        className="!w-2.5 !h-2.5 !bg-pink-400 !border-2 !border-background"
        style={{ top: "40%" }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="dns-out"
        className="!w-2.5 !h-2.5 !bg-blue-400 !border-2 !border-background"
        style={{ top: "70%" }}
      />
    </div>
  );
}

export const MatchNodeComponent_Memo = memo(MatchNodeComponent);
