import { useEffect } from "react";
import { Monitor, Smartphone, Server, LogOut } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTailnetStore } from "@/stores/tailnet";
import { cn } from "@/lib/utils";
import type { TailnetDevice } from "@/services/types";

function deviceIcon(os: string) {
  switch (os.toLowerCase()) {
    case "macos":
    case "windows":
    case "linux":
      return Monitor;
    case "ios":
    case "android":
      return Smartphone;
    default:
      return Server;
  }
}

function DeviceCard({ device, index, onSetExitNode }: { device: TailnetDevice; index: number; onSetExitNode: (id: string | null) => void }) {
  const Icon = deviceIcon(device.os);
  const isOnline = device.status === "online";

  return (
    <Card
      className={cn(
        "animate-slide-up rounded-xl border border-white/[0.06] bg-card/40 backdrop-blur-xl shadow-[0_0_20px_rgba(254,151,185,0.08)] transition-all duration-200 hover:border-white/10 hover:bg-card/80",
        !isOnline && "opacity-50"
      )}
      style={{ animationDelay: `${(index + 2) * 80}ms` }}
    >
      <CardContent className="flex items-center gap-4 p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.06] bg-muted/30 backdrop-blur-xl">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium truncate">{device.name}</span>
            {device.isSelf && <Badge variant="outline" className="text-[10px] border-white/[0.06] bg-primary/15 text-primary">This device</Badge>}
            <span className="relative">
              <span className={cn("block h-2 w-2 rounded-full", isOnline ? "bg-green-500" : "bg-muted-foreground/40")} />
              {isOnline && <span className="absolute inset-0 h-2 w-2 rounded-full bg-green-500 animate-ping opacity-75" />}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">{device.ip} • {device.os} • {device.hostname}</p>
        </div>
        {device.isExitNode && !device.isSelf && (
          <Button
            variant={device.isCurrentExitNode ? "default" : "outline"}
            size="sm"
            className={cn(
              "transition-all duration-200",
              device.isCurrentExitNode
                ? "shadow-[0_0_15px_rgba(254,151,185,0.15)]"
                : "border-white/[0.06] hover:bg-white/[0.04]"
            )}
            onClick={() => onSetExitNode(device.isCurrentExitNode ? null : device.id)}
            disabled={!isOnline}
          >
            <LogOut className="mr-2 h-3.5 w-3.5" />
            {device.isCurrentExitNode ? "Exit Node Active" : "Use as Exit Node"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export function TailnetPage() {
  const { devices, fetchDevices, setExitNode } = useTailnetStore();

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  const onlineCount = devices.filter((d) => d.status === "online").length;
  const currentExit = devices.find((d) => d.isCurrentExitNode);

  return (
    <div className="p-6 space-y-6">
      <div className="animate-slide-up">
        <h1 className="text-2xl font-semibold">Tailnet</h1>
        <p className="text-sm text-muted-foreground">
          {onlineCount}/{devices.length} devices online
          {currentExit && ` • Exit node: ${currentExit.name}`}
        </p>
      </div>

      <Card className="animate-slide-up rounded-xl border-primary/30 bg-card/40 backdrop-blur-xl shadow-[0_0_25px_rgba(254,151,185,0.1)]" style={{ animationDelay: "80ms" }}>
        <CardHeader className="pb-2">
          <CardTitle className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Exit Node</CardTitle>
        </CardHeader>
        <CardContent>
          {currentExit ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{currentExit.name}</p>
                <p className="text-xs text-muted-foreground">{currentExit.ip}</p>
              </div>
              <Button variant="outline" size="sm" className="border-white/[0.06] hover:bg-white/[0.04] transition-all duration-200" onClick={() => setExitNode(null)}>Disconnect</Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No exit node selected</p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {devices.map((device, i) => (
          <DeviceCard key={device.id} device={device} index={i} onSetExitNode={setExitNode} />
        ))}
      </div>
    </div>
  );
}
