import { useEffect } from "react";
import { Search, Trash2, X, Globe, Shield, Ban, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useConnectionsStore } from "@/stores/connections";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

const outboundColor: Record<string, string> = {
  proxy: "text-primary",
  direct: "text-green-400",
  reject: "text-red-400",
};

const outboundIcon: Record<string, typeof Globe> = {
  proxy: Globe,
  direct: Shield,
  reject: Ban,
};

export function ConnectionsPage() {
  const { t, i18n } = useTranslation();
  const {
    stats, search, outboundFilter,
    fetchRecords, fetchStats, setSearch, setOutboundFilter,
    clearAll, closeConnection, subscribe, filteredRecords,
  } = useConnectionsStore();

  useEffect(() => {
    fetchRecords();
    fetchStats();
    const unsub = subscribe();
    return unsub;
  }, [fetchRecords, fetchStats, subscribe]);

  const records = filteredRecords();
  const filters = [
    { value: "all", label: t("logs.all") },
    { value: "proxy", label: t("common.outbound.proxy") },
    { value: "direct", label: t("common.outbound.direct") },
    { value: "reject", label: t("common.outbound.reject") },
  ];

  return (
    <div className="flex flex-col h-full p-6 gap-4">
      {/* Header */}
      <div className="flex items-center justify-between animate-slide-up">
        <div>
          <h1 className="text-xl font-semibold">{t("connections.title")}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{t("connections.subtitle")}</p>
        </div>
        <Button variant="outline" size="sm" className="border-white/[0.06] text-xs" onClick={clearAll}>
          <Trash2 className="mr-1.5 h-3 w-3" /> {t("common.actions.clearAll")}
        </Button>
      </div>

      {/* Stats Bar */}
      <div className="flex items-center gap-4 animate-slide-up" style={{ animationDelay: "80ms" }}>
        <div className="flex items-center gap-1.5 text-xs">
          <Activity className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">{t("connections.total")}</span>
          <span className="font-semibold tabular-nums">{stats.total}</span>
        </div>
        <div className="h-3 w-px bg-white/10" />
        <div className="flex items-center gap-1.5 text-xs">
          <Globe className="h-3.5 w-3.5 text-primary" />
          <span className="text-muted-foreground">{t("common.outbound.proxy")}</span>
          <span className="font-semibold tabular-nums text-primary">{stats.proxy}</span>
        </div>
        <div className="h-3 w-px bg-white/10" />
        <div className="flex items-center gap-1.5 text-xs">
          <Shield className="h-3.5 w-3.5 text-green-400" />
          <span className="text-muted-foreground">{t("common.outbound.direct")}</span>
          <span className="font-semibold tabular-nums text-green-400">{stats.direct}</span>
        </div>
        <div className="h-3 w-px bg-white/10" />
        <div className="flex items-center gap-1.5 text-xs">
          <Ban className="h-3.5 w-3.5 text-red-400" />
          <span className="text-muted-foreground">{t("common.outbound.reject")}</span>
          <span className="font-semibold tabular-nums text-red-400">{stats.reject}</span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 animate-slide-up" style={{ animationDelay: "160ms" }}>
        <div className="flex gap-1 rounded-lg bg-muted/30 p-0.5">
          {filters.map((f) => (
            <button
              key={f.value}
              onClick={() => setOutboundFilter(f.value)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200",
                outboundFilter === f.value
                  ? "bg-primary text-primary-foreground shadow-[0_0_10px_rgba(254,151,185,0.15)]"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("connections.searchPlaceholder")}
            className="pl-9 bg-muted/30 border-white/[0.06] h-8 text-xs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Records */}
      <div className="flex-1 overflow-y-auto space-y-1.5 min-h-0">
        {records.map((r, i) => {
          const Icon = outboundIcon[r.outbound] ?? Globe;
          return (
            <div
              key={r.id}
              className={cn(
                "rounded-lg border border-white/[0.04] px-3 py-2.5 text-xs transition-all hover:bg-card/60",
                r.status === "active" && "border-primary/10 bg-primary/[0.02]",
                i < 3 && "animate-slide-up"
              )}
            >
              {/* Row 1: Host + Close */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <Icon className={cn("h-3.5 w-3.5 shrink-0", outboundColor[r.outbound])} />
                  <span className="font-medium truncate">{r.host}</span>
                  <Badge variant="outline" className="text-[9px] border-white/[0.06] bg-muted/20 shrink-0">
                    {r.network.toUpperCase()}
                  </Badge>
                  <span className="text-muted-foreground/50 text-[10px] shrink-0">:{r.port}</span>
                </div>
                {r.status === "active" && (
                  <button
                    onClick={() => closeConnection(r.id)}
                    className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {/* Row 2: Details */}
              <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground">
                <span className="font-mono tabular-nums">
                  {new Date(r.timestamp).toLocaleTimeString(i18n.language)}
                </span>
                <span className={cn("shrink-0", outboundColor[r.outbound])}>
                  {r.outboundNode}
                </span>
                <span className="truncate">{r.matchedRule}</span>
                <span className="ml-auto shrink-0 flex items-center gap-2">
                  {r.process && <span className="text-muted-foreground/50">{r.process}</span>}
                  <span className="font-mono tabular-nums">
                    {r.upload > 1024 ? `${(r.upload / 1024).toFixed(1)}K` : `${r.upload}B`} / {r.download > 1024 ? `${(r.download / 1024).toFixed(1)}K` : `${r.download}B`}
                  </span>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
