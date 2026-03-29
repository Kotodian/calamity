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

function DeviceCard({ device, onSetExitNode }: { device: TailnetDevice; onSetExitNode: (id: string | null) => void }) {
  const Icon = deviceIcon(device.os);
  const isOnline = device.status === "online";

  return (
    <Card className={cn(!isOnline && "opacity-50")}>
      <CardContent className="flex items-center gap-4 p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent">
          <Icon className="h-5 w-5 text-accent-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium truncate">{device.name}</span>
            {device.isSelf && <Badge variant="outline" className="text-[10px]">This device</Badge>}
            <span className={cn("h-2 w-2 rounded-full", isOnline ? "bg-green-500" : "bg-muted-foreground/40")} />
          </div>
          <p className="text-xs text-muted-foreground">{device.ip} • {device.os} • {device.hostname}</p>
        </div>
        {device.isExitNode && !device.isSelf && (
          <Button
            variant={device.isCurrentExitNode ? "default" : "outline"}
            size="sm"
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
      <div>
        <h1 className="text-2xl font-semibold">Tailnet</h1>
        <p className="text-sm text-muted-foreground">
          {onlineCount}/{devices.length} devices online
          {currentExit && ` • Exit node: ${currentExit.name}`}
        </p>
      </div>

      <Card className="bg-accent/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Exit Node</CardTitle>
        </CardHeader>
        <CardContent>
          {currentExit ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{currentExit.name}</p>
                <p className="text-xs text-muted-foreground">{currentExit.ip}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setExitNode(null)}>Disconnect</Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No exit node selected</p>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        {devices.map((device) => (
          <DeviceCard key={device.id} device={device} onSetExitNode={setExitNode} />
        ))}
      </div>
    </div>
  );
}
