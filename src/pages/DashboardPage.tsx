import { useEffect } from "react";
import { Power } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useConnectionStore } from "@/stores/connection";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatSpeed(bytesPerSec: number): string {
  return `${formatBytes(bytesPerSec)}/s`;
}

export function DashboardPage() {
  const {
    status,
    mode,
    activeNode,
    uploadSpeed,
    downloadSpeed,
    totalUpload,
    totalDownload,
    latency,
    speedHistory,
    fetchState,
    toggleConnection,
    fetchSpeedHistory,
  } = useConnectionStore();

  useEffect(() => {
    fetchState();
    fetchSpeedHistory();
  }, [fetchState, fetchSpeedHistory]);

  const isConnected = status === "connected";

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      <Card>
        <CardContent className="flex items-center gap-6 p-6">
          <Button
            variant={isConnected ? "default" : "outline"}
            size="icon"
            className="h-16 w-16 rounded-full"
            onClick={toggleConnection}
          >
            <Power className="h-7 w-7" />
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Badge variant={isConnected ? "default" : "secondary"}>
                {status.toUpperCase()}
              </Badge>
              <Badge variant="outline" className="capitalize">
                {mode}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {isConnected
                ? `Connected to ${activeNode} • ${latency}ms`
                : "Tap to connect"}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">LATENCY</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{latency}ms</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">UPLOAD</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatSpeed(uploadSpeed)}</p>
            <p className="text-xs text-muted-foreground">{formatBytes(totalUpload)} total</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">DOWNLOAD</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatSpeed(downloadSpeed)}</p>
            <p className="text-xs text-muted-foreground">{formatBytes(totalDownload)} total</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Bandwidth History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={speedHistory}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="time" className="text-xs" tick={{ fill: "var(--color-muted-foreground)" }} />
                <YAxis
                  tickFormatter={(v: number) => formatBytes(v)}
                  className="text-xs"
                  tick={{ fill: "var(--color-muted-foreground)" }}
                  width={70}
                />
                <Tooltip
                  formatter={(v) => formatSpeed(Number(v))}
                  contentStyle={{
                    backgroundColor: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "0.5rem",
                    fontSize: "12px",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="download"
                  stroke="var(--color-primary)"
                  fill="var(--color-primary)"
                  fillOpacity={0.15}
                  name="Download"
                />
                <Area
                  type="monotone"
                  dataKey="upload"
                  stroke="var(--color-chart-3)"
                  fill="var(--color-chart-3)"
                  fillOpacity={0.15}
                  name="Upload"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <p className="text-center text-[10px] text-muted-foreground/50 tracking-widest">
        ENCRYPTED WITH TLS 1.3 • AES-256-GCM • SING-BOX CORE 1.8.4
      </p>
    </div>
  );
}
