import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DnsNodeData } from "../flow-types";

function DnsNodeComponent({ data: rawData, selected }: NodeProps) {
  const data = rawData as DnsNodeData;
  const shortAddr = (data.address as string)
    .replace("https://", "")
    .replace("tls://", "")
    .replace("/dns-query", "");

  return (
    <div
      className={cn(
        "rounded-xl border bg-card/60 backdrop-blur-xl px-4 py-3 min-w-[180px] transition-all",
        selected ? "border-blue-400 shadow-[0_0_12px_rgba(96,165,250,0.3)]" : "border-white/[0.06]",
      )}
    >
      <div className="flex items-center gap-2">
        <Globe className="h-3.5 w-3.5 text-blue-400 shrink-0" />
        <div className="min-w-0">
          <p className="text-xs font-medium">{data.serverName}</p>
          <p className="text-[10px] text-muted-foreground truncate">{shortAddr}</p>
        </div>
      </div>

      <Handle
        type="target"
        position={Position.Left}
        id="dns-in"
        className="!w-2.5 !h-2.5 !bg-blue-400 !border-2 !border-background"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="detour-out"
        className="!w-2.5 !h-2.5 !bg-purple-400 !border-2 !border-background"
      />
    </div>
  );
}

export const DnsNodeComponent_Memo = memo(DnsNodeComponent);
