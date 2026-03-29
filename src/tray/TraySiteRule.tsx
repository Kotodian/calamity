import { useState } from "react";
import { Globe } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { OutboundType } from "@/services/types";
import { cn } from "@/lib/utils";

const outboundOptions: { value: OutboundType; label: string }[] = [
  { value: "proxy", label: "Proxy" },
  { value: "direct", label: "Direct" },
  { value: "reject", label: "Reject" },
];

export function TraySiteRule() {
  const [currentSite] = useState("github.com");
  const [currentOutbound, setCurrentOutbound] = useState<OutboundType>("proxy");

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
        Current Site
      </p>
      <div className="flex items-center gap-2">
        <Globe className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-mono truncate">{currentSite}</span>
      </div>
      <div className="flex gap-1">
        {outboundOptions.map((opt) => (
          <Badge
            key={opt.value}
            variant={currentOutbound === opt.value ? "default" : "outline"}
            className={cn("cursor-pointer text-[10px]")}
            onClick={() => setCurrentOutbound(opt.value)}
          >
            {opt.label}
          </Badge>
        ))}
      </div>
    </div>
  );
}
