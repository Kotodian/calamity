import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { ArrowRight, X, Globe2, Network } from "lucide-react";
import { cn } from "@/lib/utils";
import { countryFlag } from "@/lib/flags";
import type { OutboundNodeData } from "../flow-types";

const outboundIcon = (type: string) => {
  switch (type) {
    case "direct": return <Globe2 className="h-3.5 w-3.5 text-green-400" />;
    case "reject": return <X className="h-3.5 w-3.5 text-red-400" />;
    case "tailnet": return <Network className="h-3.5 w-3.5 text-cyan-400" />;
    default: return <ArrowRight className="h-3.5 w-3.5 text-pink-400" />;
  }
};

const outboundColor = (type: string, selected: boolean) => {
  if (!selected) return "border-white/[0.06]";
  switch (type) {
    case "direct": return "border-green-400 shadow-[0_0_12px_rgba(74,222,128,0.3)]";
    case "reject": return "border-red-400 shadow-[0_0_12px_rgba(248,113,113,0.3)]";
    default: return "border-pink-400 shadow-[0_0_12px_rgba(254,151,185,0.3)]";
  }
};

function OutboundNodeComponent({ data: rawData, selected }: NodeProps) {
  const data = rawData as OutboundNodeData;
  const label =
    data.outboundType === "proxy"
      ? (data.nodeName as string | undefined) ?? "Proxy"
      : data.outboundType === "dns-detour"
        ? (data.nodeName as string | undefined) ?? "Detour"
        : data.outboundType as string;

  return (
    <div
      className={cn(
        "rounded-xl border bg-card/60 backdrop-blur-xl px-4 py-3 min-w-[220px] transition-all",
        outboundColor(data.outboundType, !!selected),
      )}
    >
      <div className="flex items-center gap-2">
        {data.outboundType === "proxy" && data.nodeCountryCode ? (
          <span className="text-sm">{countryFlag(data.nodeCountryCode)}</span>
        ) : (
          outboundIcon(data.outboundType)
        )}
        <div className="min-w-0">
          <p className="text-xs font-medium truncate capitalize">{label}</p>
          {data.nodeProtocol && (
            <p className="text-[10px] text-muted-foreground">{data.nodeProtocol}</p>
          )}
        </div>
      </div>

      <Handle
        type="target"
        position={Position.Left}
        id="route-in"
        className="!w-2.5 !h-2.5 !bg-pink-400 !border-2 !border-background"
      />
    </div>
  );
}

export const OutboundNodeComponent_Memo = memo(OutboundNodeComponent);
