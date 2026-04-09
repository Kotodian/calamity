import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MatchNodeData } from "../flow-types";

const DNS_MATCH_TYPES = new Set([
  "domain-suffix", "domain-keyword", "domain-full", "domain-regex",
  "geosite", "rule-set",
]);

function MatchNodeComponent({ data: rawData, selected }: NodeProps) {
  const data = rawData as MatchNodeData;
  const needsDns = DNS_MATCH_TYPES.has(data.matchType as string);
  return (
    <div
      className={cn(
        "rounded-xl border bg-card/60 backdrop-blur-xl px-4 py-3 min-w-[260px] transition-all",
        selected ? "border-primary shadow-[0_0_12px_rgba(254,151,185,0.3)]" : "border-white/[0.06]",
        !data.enabled && "opacity-40",
      )}
    >
      <div className="flex items-center gap-2">
        <Filter className="h-3.5 w-3.5 text-pink-400 shrink-0" />
        <div className="min-w-0">
          <p className="text-xs font-medium truncate">{data.ruleName as string}</p>
          <p className="text-[10px] text-muted-foreground truncate">
            {data.matchType as string}{data.invert ? " !" : ""}: {data.matchValue as string}
          </p>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        id="route-out"
        className="!w-2.5 !h-2.5 !bg-pink-400 !border-2 !border-background"
        style={{ top: needsDns ? "40%" : "50%" }}
      />
      {needsDns && (
        <Handle
          type="source"
          position={Position.Right}
          id="dns-out"
          className="!w-2.5 !h-2.5 !bg-blue-400 !border-2 !border-background"
          style={{ top: "70%" }}
        />
      )}
    </div>
  );
}

export const MatchNodeComponent_Memo = memo(MatchNodeComponent);
