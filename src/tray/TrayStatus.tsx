import { ArrowUp, ArrowDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { useConnectionStore } from "@/stores/connection";

function formatSpeed(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB/s`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB/s`;
}

export function TrayStatus() {
  const { t } = useTranslation();
  const { status, mode, activeNode, uploadSpeed, downloadSpeed, latency } = useConnectionStore();
  const isConnected = status === "connected";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${isConnected ? "bg-green-500" : "bg-muted-foreground/40"}`} />
          <span className="text-sm font-medium">{isConnected ? t("common.status.connected") : t("common.status.disconnected")}</span>
        </div>
        {isConnected && (
          <Badge variant="outline" className="text-[10px]">{latency}ms</Badge>
        )}
      </div>
      {isConnected && mode === "global" && activeNode && (
        <p className="text-xs text-muted-foreground">{activeNode}</p>
      )}
      {isConnected && (
        <div className="flex gap-4 text-xs">
          <span className="flex items-center gap-1 text-muted-foreground">
            <ArrowUp className="h-3 w-3" /> {formatSpeed(uploadSpeed)}
          </span>
          <span className="flex items-center gap-1 text-muted-foreground">
            <ArrowDown className="h-3 w-3" /> {formatSpeed(downloadSpeed)}
          </span>
        </div>
      )}
    </div>
  );
}
