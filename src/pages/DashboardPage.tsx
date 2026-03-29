import { useEffect, useState, useRef } from "react";
import { Power, ArrowUp, ArrowDown, Shield, Database } from "lucide-react";
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

export function DashboardPage() {
  const {
    status, activeNode, uploadSpeed, downloadSpeed,
    totalUpload, totalDownload, latency, speedHistory,
    fetchState, toggleConnection, fetchSpeedHistory,
  } = useConnectionStore();
  const { groups, fetchGroups } = useNodesStore();
  const [justConnected, setJustConnected] = useState(false);
  const prevStatusRef = useRef(status);

  useEffect(() => {
    fetchState();
    fetchSpeedHistory();
    fetchGroups();
  }, [fetchState, fetchSpeedHistory, fetchGroups]);

  useEffect(() => {
    if (prevStatusRef.current === "connecting" && status === "connected") {
      setJustConnected(true);
      const timer = setTimeout(() => setJustConnected(false), 1500);
      return () => clearTimeout(timer);
    }
    prevStatusRef.current = status;
  }, [status]);

  const isConnected = status === "connected";
  const isConnecting = status === "connecting";
  const activeNodeObj = groups.flatMap((g) => g.nodes).find((n) => n.active);

  return (
    <div className="p-6 min-h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-lg font-semibold">Network Overview</h1>
        {isConnected && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-green-500/15 px-2.5 py-0.5 text-[10px] font-semibold text-green-400 uppercase tracking-wider">
            <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
            Online
          </span>
        )}
      </div>

      {/* Center Power Ring */}
      <div className="flex-1 flex flex-col items-center justify-center -mt-4">
        {/* Power Button with Rings */}
        <div className="relative mb-6">
          {/* Outer decorative ring */}
          <div className={cn(
            "absolute inset-[-20px] rounded-full border transition-all duration-1000",
            isConnected ? "border-primary/20" : "border-white/[0.04]",
            isConnecting && "animate-spin border-yellow-500/30"
          )} style={{ animationDuration: "3s" }} />

          {/* Middle ring */}
          <div className={cn(
            "absolute inset-[-10px] rounded-full border transition-all duration-700",
            isConnected ? "border-primary/30" : "border-white/[0.06]",
            isConnecting && "animate-spin border-yellow-500/20"
          )} style={{ animationDuration: "2s", animationDirection: "reverse" }} />

          {/* Glow burst */}
          {justConnected && (
            <div className="absolute inset-[-30px] rounded-full bg-primary/20 animate-glow-expand" />
          )}

          {/* Main button */}
          <button
            onClick={toggleConnection}
            className={cn(
              "relative z-10 h-28 w-28 rounded-full flex items-center justify-center transition-all duration-500",
              isConnected && "bg-gradient-to-br from-primary/20 to-primary/5 text-primary shadow-[0_0_40px_rgba(254,151,185,0.2)] animate-power-ring",
              isConnecting && "bg-gradient-to-br from-yellow-500/20 to-yellow-500/5 text-yellow-400 animate-power-connecting",
              !isConnected && !isConnecting && "bg-muted/30 text-muted-foreground hover:bg-muted/50 hover:scale-105 active:scale-95",
            )}
          >
            <Power className={cn(
              "h-10 w-10 transition-all duration-700",
              isConnecting && "rotate-180 scale-90"
            )} />

            {isConnecting && (
              <div className="absolute inset-0 rounded-full overflow-hidden">
                <div className="absolute inset-x-0 h-1/3 bg-gradient-to-b from-yellow-400/25 to-transparent animate-scan-line" />
              </div>
            )}
          </button>
        </div>

        {/* Status Text */}
        <div className="text-center mb-2">
          {isConnected && (
            <div className="animate-slide-up">
              <p className="text-sm font-semibold tracking-widest uppercase text-primary mb-0.5">Connected</p>
              <div className="flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground">
                <Shield className="h-3 w-3 text-primary" />
                <span className="uppercase tracking-wider">Protected</span>
              </div>
            </div>
          )}
          {isConnecting && (
            <p className="text-sm font-medium text-yellow-400 animate-pulse tracking-wider uppercase">
              Connecting...
            </p>
          )}
          {!isConnected && !isConnecting && (
            <p className="text-sm text-muted-foreground">Tap to connect</p>
          )}
        </div>

        {/* Active Node */}
        {isConnected && activeNodeObj && (
          <div className="flex items-center gap-2 mt-1 animate-slide-up" style={{ animationDelay: "100ms" }}>
            <span className="text-lg">{flagEmoji[activeNodeObj.countryCode] ?? "\u{1F310}"}</span>
            <span className="text-sm font-medium">{activeNode}</span>
            <span className="text-xs text-muted-foreground">• {latency}ms</span>
          </div>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4 mb-5">
        {[
          {
            label: "Upload Speed",
            value: formatSpeed(uploadSpeed),
            icon: ArrowUp,
            iconColor: "text-primary",
            gradient: "from-primary/10 to-transparent",
          },
          {
            label: "Download Speed",
            value: formatSpeed(downloadSpeed),
            icon: ArrowDown,
            iconColor: "text-green-400",
            gradient: "from-green-500/10 to-transparent",
          },
          {
            label: "Session Traffic",
            value: formatBytes(totalDownload + totalUpload),
            icon: Database,
            iconColor: "text-purple-400",
            gradient: "from-purple-500/10 to-transparent",
          },
        ].map((card, i) => (
          <div
            key={card.label}
            className={cn(
              "rounded-xl border border-white/[0.06] bg-gradient-to-b p-4 backdrop-blur-xl animate-slide-up",
              card.gradient
            )}
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <div className="flex items-center justify-between mb-2">
              <card.icon className={cn("h-4 w-4", card.iconColor)} />
              <span className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider">{card.label}</span>
            </div>
            <p className="text-xl font-bold tabular-nums">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Bandwidth Chart */}
      <div className="rounded-2xl border border-white/[0.06] bg-card/40 backdrop-blur-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium">Bandwidth History</h3>
        </div>
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={speedHistory}>
              <defs>
                <linearGradient id="dlGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#fe97b9" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#fe97b9" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="ulGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#a4a1ff" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#a4a1ff" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="time" tick={{ fill: "#444", fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={(v: number) => formatBytes(v)} tick={{ fill: "#444", fontSize: 9 }} axisLine={false} tickLine={false} width={60} />
              <Tooltip
                formatter={(v) => formatSpeed(Number(v))}
                contentStyle={{ backgroundColor: "rgba(35,35,63,0.95)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "0.5rem", fontSize: "11px", color: "#e5e3ff" }}
              />
              <Area type="natural" dataKey="download" stroke="#fe97b9" strokeWidth={2} fill="url(#dlGrad)" name="Download" animationDuration={1200} />
              <Area type="natural" dataKey="upload" stroke="#a4a1ff" strokeWidth={1.5} fill="url(#ulGrad)" name="Upload" animationDuration={1400} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Security Footer */}
      <div className="flex items-center justify-center gap-3 pt-4 pb-1">
        <div className="h-px flex-1 bg-white/[0.04]" />
        <p className="text-[9px] text-muted-foreground/30 tracking-[0.15em] uppercase">
          TLS 1.3 • AES-256-GCM • SingBox 1.8.4
        </p>
        <div className="h-px flex-1 bg-white/[0.04]" />
      </div>
    </div>
  );
}
