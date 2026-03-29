import { useEffect } from "react";
import { Power, ArrowUpRight, ArrowDownRight, Zap, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useConnectionStore } from "@/stores/connection";
import { useNodesStore } from "@/stores/nodes";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { cn } from "@/lib/utils";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatSpeed(bytesPerSec: number): string {
  return `${formatBytes(bytesPerSec)}/s`;
}

const flagEmoji: Record<string, string> = {
  JP: "\u{1F1EF}\u{1F1F5}",
  US: "\u{1F1FA}\u{1F1F8}",
  SG: "\u{1F1F8}\u{1F1EC}",
  HK: "\u{1F1ED}\u{1F1F0}",
  KR: "\u{1F1F0}\u{1F1F7}",
};

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

  const { groups, fetchGroups } = useNodesStore();

  useEffect(() => {
    fetchState();
    fetchSpeedHistory();
    fetchGroups();
  }, [fetchState, fetchSpeedHistory, fetchGroups]);

  const isConnected = status === "connected";
  const isConnecting = status === "connecting";

  // Find active node details
  const activeNodeObj = groups
    .flatMap((g) => g.nodes)
    .find((n) => n.active);

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <div className="flex items-center gap-2 mt-1">
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                isConnected && "bg-green-500",
                isConnecting && "bg-yellow-500 animate-pulse",
                status === "disconnected" && "bg-muted-foreground/40"
              )}
            />
            <span className="text-sm text-muted-foreground">
              {isConnected ? "System Online" : isConnecting ? "Connecting..." : "System Offline"}
            </span>
          </div>
        </div>
        <Badge variant="outline" className="capitalize text-xs">
          {mode} Mode
        </Badge>
      </div>

      {/* Connection + Active Node */}
      <Card>
        <CardContent className="p-0">
          <div className="flex items-stretch">
            {/* Power Button */}
            <button
              onClick={toggleConnection}
              className={cn(
                "flex items-center justify-center w-20 transition-colors",
                isConnected
                  ? "bg-primary/10 text-primary hover:bg-primary/20"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
            >
              <Power className="h-6 w-6" />
            </button>

            {/* Active Node Info */}
            <div className="flex-1 flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <span className="text-2xl">
                  {activeNodeObj ? (flagEmoji[activeNodeObj.countryCode] ?? "\u{1F310}") : "\u{1F310}"}
                </span>
                <div>
                  <p className="font-semibold">{activeNode ?? "No Node"}</p>
                  <p className="text-xs text-muted-foreground">
                    {activeNodeObj
                      ? `${activeNodeObj.protocol} • ${latency}ms`
                      : "Not connected"}
                  </p>
                </div>
              </div>
              <Button variant="outline" size="sm" asChild>
                <a href="/nodes">
                  <RefreshCw className="mr-1.5 h-3 w-3" />
                  Switch
                </a>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Metric Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Latency</span>
              <Zap className="h-3.5 w-3.5 text-yellow-500" />
            </div>
            <p className="text-2xl font-bold tabular-nums">{latency}<span className="text-sm font-normal text-muted-foreground ml-0.5">ms</span></p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Upload</span>
              <ArrowUpRight className="h-3.5 w-3.5 text-primary" />
            </div>
            <p className="text-2xl font-bold tabular-nums">{formatSpeed(uploadSpeed)}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{formatBytes(totalUpload)} total</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Download</span>
              <ArrowDownRight className="h-3.5 w-3.5 text-green-500" />
            </div>
            <p className="text-2xl font-bold tabular-nums">{formatSpeed(downloadSpeed)}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{formatBytes(totalDownload)} total</p>
          </CardContent>
        </Card>
      </div>

      {/* Bandwidth Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Bandwidth History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={speedHistory}>
                <defs>
                  <linearGradient id="downloadGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="uploadGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-chart-3)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--color-chart-3)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                <XAxis
                  dataKey="time"
                  tick={{ fill: "var(--color-muted-foreground)", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v: number) => formatBytes(v)}
                  tick={{ fill: "var(--color-muted-foreground)", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  width={65}
                />
                <Tooltip
                  formatter={(v) => formatSpeed(Number(v))}
                  contentStyle={{
                    backgroundColor: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "0.5rem",
                    fontSize: "11px",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="download"
                  stroke="var(--color-primary)"
                  strokeWidth={2}
                  fill="url(#downloadGrad)"
                  name="Download"
                />
                <Area
                  type="monotone"
                  dataKey="upload"
                  stroke="var(--color-chart-3)"
                  strokeWidth={2}
                  fill="url(#uploadGrad)"
                  name="Upload"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Security Footer */}
      <div className="flex items-center justify-center gap-2">
        <div className="h-px flex-1 bg-border/30" />
        <p className="text-[9px] text-muted-foreground/40 tracking-[0.2em] uppercase">
          Encrypted with TLS 1.3 • AES-256-GCM • SingBox Core 1.8.4
        </p>
        <div className="h-px flex-1 bg-border/30" />
      </div>
    </div>
  );
}
