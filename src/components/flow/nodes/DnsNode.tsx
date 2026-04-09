import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Globe, Shield, Wifi } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DnsNodeData } from "../flow-types";

function getProtocolInfo(address: string): { label: string; icon: typeof Globe } {
  if (address.startsWith("https://")) return { label: "DoH", icon: Shield };
  if (address.startsWith("tls://")) return { label: "DoT", icon: Shield };
  if (address.startsWith("quic://")) return { label: "DoQ", icon: Wifi };
  if (address.startsWith("h3://")) return { label: "DoH3", icon: Wifi };
  return { label: "UDP", icon: Globe };
}

function DnsNodeComponent({ data: rawData, selected }: NodeProps) {
  const data = rawData as DnsNodeData;
  const addr = data.address as string;
  const { label: proto, icon: Icon } = getProtocolInfo(addr);
  const shortAddr = addr
    .replace(/^https?:\/\//, "")
    .replace(/^tls:\/\//, "")
    .replace(/^quic:\/\//, "")
    .replace(/^h3:\/\//, "")
    .replace("/dns-query", "");

  return (
    <div
      className={cn(
        "rounded-xl border bg-card/60 backdrop-blur-xl px-4 py-3 min-w-[240px] transition-all",
        selected ? "border-blue-400 shadow-[0_0_12px_rgba(96,165,250,0.3)]" : "border-white/[0.06]",
      )}
    >
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-blue-400 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-xs font-medium">{data.serverName}</p>
            <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-blue-400/10 text-blue-400 font-medium">
              {proto}
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground truncate mt-0.5">{shortAddr}</p>
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
