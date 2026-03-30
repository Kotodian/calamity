import { useEffect, useState, useRef } from "react";
import { Power, ArrowUp, ArrowDown, Shield, Database, LogOut, Wifi, Cpu, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useConnectionStore } from "@/stores/connection";
import { useNodesStore } from "@/stores/nodes";
import { useTailnetStore } from "@/stores/tailnet";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { cn } from "@/lib/utils";
import { countryFlag } from "@/lib/flags";
import { useTranslation } from "react-i18next";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatSpeed(bytesPerSec: number): string {
  return `${formatBytes(bytesPerSec)}/s`;
}

function formatUptime(startedAt: number | null): string {
  if (!startedAt) return "0s";
  const seconds = Math.floor((Date.now() - startedAt) / 1000);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

export function DashboardPage() {
  const { t } = useTranslation();
  const {
    status, mode, activeNode, uploadSpeed, downloadSpeed,
    totalUpload, totalDownload, latency, speedHistory,
    activeConnections, memoryInuse, version, startedAt,
    fetchState, subscribeTraffic, fetchDashboardInfo, toggleConnection,
  } = useConnectionStore();
  const { groups, fetchGroups } = useNodesStore();
  const { devices, fetchAccount, fetchDevices } = useTailnetStore();
  const [justConnected, setJustConnected] = useState(false);
  const [justDisconnected, setJustDisconnected] = useState(false);
  const [uptimeStr, setUptimeStr] = useState("0s");
  const prevStatusRef = useRef(status);

  // Subscribe to traffic stream
  useEffect(() => {
    fetchState();
    fetchDashboardInfo();
    fetchGroups();
    fetchAccount();
    fetchDevices();

    let unsubTraffic = subscribeTraffic();

    // Re-subscribe when sing-box restarts
    let unlistenRestart: (() => void) | null = null;
    (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        unlistenRestart = await listen("singbox-restarted", () => {
          unsubTraffic();
          unsubTraffic = subscribeTraffic();
          fetchState();
          fetchDashboardInfo();
        });
      } catch {}
    })();

    return () => {
      unsubTraffic();
      if (unlistenRestart) unlistenRestart();
    };
  }, [fetchState, fetchDashboardInfo, subscribeTraffic, fetchGroups, fetchAccount, fetchDevices]);

  // Update uptime every second
  useEffect(() => {
    const interval = setInterval(() => {
      setUptimeStr(formatUptime(startedAt));
    }, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    if (prevStatusRef.current === "connecting" && status === "connected") {
      setJustConnected(true);
      setJustDisconnected(false);
      timer = setTimeout(() => setJustConnected(false), 1500);
    } else if (
      (prevStatusRef.current === "connected" || prevStatusRef.current === "disconnecting") &&
      status === "disconnected"
    ) {
      setJustDisconnected(true);
      setJustConnected(false);
      timer = setTimeout(() => setJustDisconnected(false), 1200);
    }

    prevStatusRef.current = status;
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [status]);

  const isConnected = status === "connected";
  const isConnecting = status === "connecting";
  const isDisconnecting = status === "disconnecting";
  const activeNodeObj = groups.flatMap((g) => g.nodes).find((n) => n.active);
  const exitNode = devices.find((d) => d.isCurrentExitNode);

  return (
    <div className="p-6 min-h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-lg font-semibold">{t("dashboard.title")}</h1>
        {isConnected && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-green-500/15 px-2.5 py-0.5 text-[10px] font-semibold text-green-400 uppercase tracking-wider">
            <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
            {t("common.status.online")}
          </span>
        )}
      </div>

      {/* Center Power Ring */}
      <div className="flex-1 flex flex-col items-center justify-center -mt-4">
        <div className="relative mb-6">
          <div className={cn(
            "absolute inset-[-20px] rounded-full border transition-all duration-1000",
            isConnected ? "border-primary/20" : "border-white/[0.04]",
            isConnecting && "animate-spin border-yellow-500/30",
            isDisconnecting && "animate-spin border-red-500/25",
            justDisconnected && "animate-power-ring-disconnect border-primary/30"
          )} style={{ animationDuration: "3s" }} />
          <div className={cn(
            "absolute inset-[-10px] rounded-full border transition-all duration-700",
            isConnected ? "border-primary/30" : "border-white/[0.06]",
            isConnecting && "animate-spin border-yellow-500/20",
            isDisconnecting && "animate-spin border-red-500/15",
            justDisconnected && "animate-power-ring-disconnect-delayed border-primary/40"
          )} style={{ animationDuration: "2s", animationDirection: "reverse" }} />
          {justConnected && (
            <div className="absolute inset-[-30px] rounded-full bg-primary/20 animate-glow-expand" />
          )}
          {justDisconnected && (
            <>
              <div className="absolute inset-[-24px] rounded-full border border-primary/35 animate-power-shockwave" />
              <div className="absolute inset-0 rounded-full bg-gradient-to-b from-background/10 via-background/35 to-background/70 animate-power-core-cooldown" />
            </>
          )}
          <button
            data-testid="dashboard-power-button"
            onClick={toggleConnection}
            disabled={isDisconnecting}
            className={cn(
              "relative z-10 h-28 w-28 rounded-full flex items-center justify-center transition-all duration-500",
              isConnected && "bg-gradient-to-br from-primary/20 to-primary/5 text-primary shadow-[0_0_40px_rgba(254,151,185,0.2)] animate-power-ring",
              isConnecting && "bg-gradient-to-br from-yellow-500/20 to-yellow-500/5 text-yellow-400 animate-power-connecting",
              isDisconnecting && "bg-gradient-to-br from-red-500/15 to-red-500/5 text-red-400 animate-power-connecting cursor-not-allowed",
              justDisconnected && "animate-power-disconnecting bg-gradient-to-br from-slate-400/10 to-background/10 text-muted-foreground shadow-[0_0_28px_rgba(148,163,184,0.12)]",
              !isConnected && !isConnecting && !isDisconnecting && "bg-muted/30 text-muted-foreground hover:bg-muted/50 hover:scale-105 active:scale-95",
            )}
          >
            <Power className={cn(
              "h-10 w-10 transition-all duration-700",
              isConnecting && "rotate-180 scale-90",
              isDisconnecting && "rotate-180 scale-90",
              justDisconnected && "animate-power-icon-disconnecting"
            )} />
            {(isConnecting || isDisconnecting) && (
              <div className="absolute inset-0 rounded-full overflow-hidden">
                <div className={cn(
                  "absolute inset-x-0 h-1/3 bg-gradient-to-b to-transparent animate-scan-line",
                  isConnecting ? "from-yellow-400/25" : "from-red-400/25"
                )} />
              </div>
            )}
          </button>
        </div>

        {/* Status Text */}
        <div className="text-center mb-2">
          {isConnected && (
            <div className="animate-slide-up">
              <p className="text-sm font-semibold tracking-widest uppercase text-primary mb-0.5">{t("common.status.connected")}</p>
              <div className="flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground">
                <Shield className="h-3 w-3 text-primary" />
                <span className="uppercase tracking-wider">{t("common.status.protected")}</span>
              </div>
            </div>
          )}
          {isConnecting && (
            <p className="text-sm font-medium text-yellow-400 animate-pulse tracking-wider uppercase">
              {t("common.status.connecting")}
            </p>
          )}
          {isDisconnecting && (
            <p className="text-sm font-medium text-red-400 animate-pulse tracking-wider uppercase">
              {t("common.status.disconnecting")}
            </p>
          )}
          {!isConnected && !isConnecting && !isDisconnecting && (
            <p className={cn("text-sm text-muted-foreground", justDisconnected && "animate-power-status-disconnecting")}>
              {t("dashboard.tapToConnect")}
            </p>
          )}
        </div>

        {/* Active Node — only show in global mode */}
        {isConnected && mode === "global" && (
          <div className="flex items-center gap-2 mt-1 animate-slide-up" style={{ animationDelay: "100ms" }}>
            {exitNode ? (
              <>
                <LogOut className="h-4 w-4 text-purple-400" />
                <span className="text-sm font-medium">{exitNode.name}</span>
                <Badge variant="outline" className="text-[9px] border-purple-500/30 bg-purple-500/10 text-purple-400">{t("dashboard.exitNode")}</Badge>
                <span className="text-xs text-muted-foreground">- {exitNode.ip}</span>
              </>
            ) : activeNodeObj ? (
              <>
                <span className="text-lg">{countryFlag(activeNodeObj.countryCode)}</span>
                <span className="text-sm font-medium">{activeNode}</span>
                <span className="text-xs text-muted-foreground">{latency > 0 ? `- ${latency}ms` : ""}</span>
              </>
            ) : null}
          </div>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {[
          { label: t("dashboard.upload"), value: formatSpeed(uploadSpeed), icon: ArrowUp, iconColor: "text-primary", gradient: "from-primary/10 to-transparent" },
          { label: t("dashboard.download"), value: formatSpeed(downloadSpeed), icon: ArrowDown, iconColor: "text-green-400", gradient: "from-green-500/10 to-transparent" },
          { label: t("dashboard.traffic"), value: formatBytes(totalDownload + totalUpload), icon: Database, iconColor: "text-purple-400", gradient: "from-purple-500/10 to-transparent" },
          { label: t("dashboard.connections"), value: `${activeConnections}`, icon: Wifi, iconColor: "text-blue-400", gradient: "from-blue-500/10 to-transparent" },
          { label: t("dashboard.memory"), value: formatBytes(memoryInuse), icon: Cpu, iconColor: "text-orange-400", gradient: "from-orange-500/10 to-transparent" },
          { label: t("dashboard.uptime"), value: uptimeStr, icon: Clock, iconColor: "text-cyan-400", gradient: "from-cyan-500/10 to-transparent" },
        ].map((card, i) => (
          <div
            key={card.label}
            className={cn(
              "rounded-xl border border-white/[0.06] bg-gradient-to-b p-3.5 backdrop-blur-xl animate-slide-up",
              card.gradient
            )}
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className="flex items-center justify-between mb-1.5">
              <card.icon className={cn("h-3.5 w-3.5", card.iconColor)} />
              <span className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider">{card.label}</span>
            </div>
            <p className="text-lg font-bold tabular-nums">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Bandwidth Chart */}
      <div className="rounded-2xl border border-white/[0.06] bg-card/40 backdrop-blur-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium">{t("dashboard.bandwidthHistory")}</h3>
          <span className="text-[9px] text-muted-foreground uppercase tracking-wider">{t("dashboard.lastFiveMinutes")}</span>
        </div>
        <div className="h-36">
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
              <XAxis dataKey="time" tick={{ fill: "#444", fontSize: 9 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis tickFormatter={(v: number) => formatBytes(v)} tick={{ fill: "#444", fontSize: 9 }} axisLine={false} tickLine={false} width={60} />
              <Tooltip
                formatter={(v) => formatSpeed(Number(v))}
                contentStyle={{ backgroundColor: "rgba(35,35,63,0.95)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "0.5rem", fontSize: "11px", color: "#e5e3ff" }}
              />
              <Area type="natural" dataKey="download" stroke="#fe97b9" strokeWidth={2} fill="url(#dlGrad)" name={t("dashboard.download")} animationDuration={300} />
              <Area type="natural" dataKey="upload" stroke="#a4a1ff" strokeWidth={1.5} fill="url(#ulGrad)" name={t("dashboard.upload")} animationDuration={300} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Security Footer */}
      <div className="flex items-center justify-center gap-3 pt-4 pb-1">
        <div className="h-px flex-1 bg-white/[0.04]" />
        <p className="text-[9px] text-muted-foreground/30 tracking-[0.15em] uppercase">
          TLS 1.3 - AES-256-GCM - SingBox {version || "1.13.4"}
        </p>
        <div className="h-px flex-1 bg-white/[0.04]" />
      </div>
    </div>
  );
}
