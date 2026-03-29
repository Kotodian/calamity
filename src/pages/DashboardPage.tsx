import { useEffect, useState } from "react";
import { Power, ArrowUp, ArrowDown, Activity, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConnectionStore } from "@/stores/connection";
import { useNodesStore } from "@/stores/nodes";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
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
  JP: "\u{1F1EF}\u{1F1F5}", US: "\u{1F1FA}\u{1F1F8}", SG: "\u{1F1F8}\u{1F1EC}",
  HK: "\u{1F1ED}\u{1F1F0}", KR: "\u{1F1F0}\u{1F1F7}",
};

type TimeRange = "1H" | "24H" | "7D";

export function DashboardPage() {
  const {
    status, activeNode, uploadSpeed, downloadSpeed,
    totalUpload, totalDownload, latency, speedHistory,
    fetchState, toggleConnection, fetchSpeedHistory,
  } = useConnectionStore();
  const { groups, fetchGroups } = useNodesStore();
  const [timeRange, setTimeRange] = useState<TimeRange>("1H");

  useEffect(() => {
    fetchState();
    fetchSpeedHistory();
    fetchGroups();
  }, [fetchState, fetchSpeedHistory, fetchGroups]);

  const isConnected = status === "connected";
  const isConnecting = status === "connecting";
  const activeNodeObj = groups.flatMap((g) => g.nodes).find((n) => n.active);

  return (
    <div className="p-6 space-y-5 min-h-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Dashboard</h1>
      </div>

      {/* Connection Panel */}
      <div className="rounded-2xl border border-white/[0.06] bg-card/60 backdrop-blur-xl p-6 shadow-[0_0_40px_rgba(254,151,185,0.06)]">
        <div className="flex items-center gap-6">
          {/* Power Button */}
          <button
            onClick={toggleConnection}
            className={cn(
              "relative h-20 w-20 rounded-full flex items-center justify-center transition-all shrink-0",
              isConnected
                ? "bg-primary/15 text-primary shadow-[0_0_30px_rgba(254,151,185,0.25)] hover:bg-primary/25"
                : isConnecting
                  ? "bg-yellow-500/15 text-yellow-400 animate-pulse"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted/80"
            )}
          >
            <Power className="h-8 w-8" />
            {isConnected && (
              <span className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-green-500 border-2 border-card" />
            )}
          </button>

          {/* Status Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              {isConnected && (
                <>
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-500/15 px-2.5 py-0.5 text-[10px] font-semibold text-green-400 uppercase tracking-wider">
                    <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
                    Connected
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-0.5 text-[10px] font-semibold text-primary uppercase tracking-wider">
                    <Shield className="h-2.5 w-2.5" />
                    Protected
                  </span>
                </>
              )}
              {!isConnected && !isConnecting && (
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Disconnected
                </span>
              )}
            </div>

            {isConnected && activeNodeObj ? (
              <div className="flex items-center gap-3">
                <span className="text-2xl">{flagEmoji[activeNodeObj.countryCode] ?? "\u{1F310}"}</span>
                <div>
                  <p className="font-semibold text-lg leading-tight">{activeNode}</p>
                  <p className="text-xs text-muted-foreground">{activeNodeObj.protocol} • {activeNodeObj.server}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Click power to connect</p>
            )}
          </div>

          {/* Node Switch */}
          {isConnected && (
            <Button variant="outline" size="sm" className="border-white/10 shrink-0" asChild>
              <a href="/nodes">Switch</a>
            </Button>
          )}
        </div>

        {/* Inline Metrics */}
        {isConnected && (
          <div className="flex items-center gap-6 mt-5 pt-4 border-t border-white/[0.06]">
            <div className="flex items-center gap-2">
              <Activity className="h-3.5 w-3.5 text-yellow-400" />
              <span className="text-xs text-muted-foreground">Latency</span>
              <span className="text-sm font-semibold tabular-nums">{latency}ms</span>
            </div>
            <div className="h-3 w-px bg-white/10" />
            <div className="flex items-center gap-2">
              <ArrowUp className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs text-muted-foreground">Upload</span>
              <span className="text-sm font-semibold tabular-nums">{formatSpeed(uploadSpeed)}</span>
            </div>
            <div className="h-3 w-px bg-white/10" />
            <div className="flex items-center gap-2">
              <ArrowDown className="h-3.5 w-3.5 text-green-400" />
              <span className="text-xs text-muted-foreground">Download</span>
              <span className="text-sm font-semibold tabular-nums">{formatSpeed(downloadSpeed)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-white/[0.06] bg-card/60 backdrop-blur-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Upload Speed</span>
            <ArrowUp className="h-3.5 w-3.5 text-primary" />
          </div>
          <p className="text-2xl font-bold tabular-nums">{formatSpeed(uploadSpeed)}</p>
          <p className="text-[10px] text-muted-foreground/60 mt-1">Peak</p>
        </div>

        <div className="rounded-xl border border-white/[0.06] bg-card/60 backdrop-blur-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Download Speed</span>
            <ArrowDown className="h-3.5 w-3.5 text-green-400" />
          </div>
          <p className="text-2xl font-bold tabular-nums">{formatSpeed(downloadSpeed)}</p>
          <p className="text-[10px] text-muted-foreground/60 mt-1">Optimal</p>
        </div>

        <div className="rounded-xl border border-white/[0.06] bg-card/60 backdrop-blur-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Total Traffic</span>
            <Activity className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <p className="text-2xl font-bold tabular-nums">{formatBytes(totalDownload + totalUpload)}</p>
          <p className="text-[10px] text-muted-foreground/60 mt-1">
            {formatBytes(totalDownload)} Down • {formatBytes(totalUpload)} Up
          </p>
        </div>
      </div>

      {/* Bandwidth Chart */}
      <div className="rounded-2xl border border-white/[0.06] bg-card/60 backdrop-blur-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium">Bandwidth History</h3>
          <div className="flex gap-1 rounded-lg bg-muted/50 p-0.5">
            {(["1H", "24H", "7D"] as TimeRange[]).map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={cn(
                  "px-2.5 py-1 text-[10px] font-medium rounded-md transition-colors",
                  timeRange === range
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {range}
              </button>
            ))}
          </div>
        </div>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={speedHistory}>
              <defs>
                <linearGradient id="dlGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#fe97b9" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#fe97b9" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="ulGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#a4a1ff" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#a4a1ff" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="time"
                tick={{ fill: "#666", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v: number) => formatBytes(v)}
                tick={{ fill: "#666", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                width={65}
              />
              <Tooltip
                formatter={(v) => formatSpeed(Number(v))}
                contentStyle={{
                  backgroundColor: "rgba(35, 35, 63, 0.95)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: "0.5rem",
                  fontSize: "11px",
                  color: "#e5e3ff",
                  backdropFilter: "blur(20px)",
                }}
              />
              <Area
                type="monotone"
                dataKey="download"
                stroke="#fe97b9"
                strokeWidth={2}
                fill="url(#dlGrad)"
                name="Download"
              />
              <Area
                type="monotone"
                dataKey="upload"
                stroke="#a4a1ff"
                strokeWidth={1.5}
                fill="url(#ulGrad)"
                name="Upload"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Security Footer */}
      <div className="flex items-center justify-center gap-3 pt-2">
        <div className="h-px flex-1 bg-white/[0.04]" />
        <p className="text-[9px] text-muted-foreground/30 tracking-[0.2em] uppercase font-medium">
          Encrypted with TLS 1.3 • AES-256-GCM • SingBox Core 1.8.4
        </p>
        <div className="h-px flex-1 bg-white/[0.04]" />
      </div>
    </div>
  );
}
