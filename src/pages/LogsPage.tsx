import { useEffect, useRef } from "react";
import { Trash2, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLogsStore } from "@/stores/logs";
import type { LogLevel } from "@/services/types";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

const levelStyles: Record<LogLevel, string> = {
  debug: "bg-muted/40 text-muted-foreground",
  info: "bg-blue-500/15 text-blue-400 shadow-[0_0_8px_rgba(59,130,246,0.15)]",
  warn: "bg-yellow-500/15 text-yellow-400 shadow-[0_0_8px_rgba(234,179,8,0.15)]",
  error: "bg-red-500/15 text-red-400 shadow-[0_0_8px_rgba(239,68,68,0.15)]",
};

export function LogsPage() {
  const { t, i18n } = useTranslation();
  const { filter, search, autoScroll, fetchLogs, setFilter, setSearch, clearLogs, subscribe, filteredLogs } =
    useLogsStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchLogs();
    const unsub = subscribe();
    return unsub;
  }, [fetchLogs, subscribe]);

  const filtered = filteredLogs();

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filtered.length, autoScroll]);

  return (
    <div className="flex h-full flex-col p-6 gap-4">
      <div className="flex items-center justify-between animate-slide-up">
        <h1 className="text-2xl font-semibold">{t("logs.title")}</h1>
        <Button variant="outline" size="sm" className="border-white/[0.06] hover:bg-white/[0.04] transition-all duration-200" onClick={clearLogs}>
          <Trash2 className="mr-2 h-3.5 w-3.5" /> {t("common.actions.clear")}
        </Button>
      </div>

      <div className="flex items-center gap-3 animate-slide-up" style={{ animationDelay: "80ms" }}>
        <Tabs value={filter ?? "all"} onValueChange={(v) => setFilter(v === "all" ? null : (v as LogLevel))}>
          <TabsList className="bg-muted/30 border border-white/[0.06] backdrop-blur-xl rounded-full p-1">
            <TabsTrigger value="all" className="rounded-full text-xs px-3 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-[0_0_15px_rgba(254,151,185,0.15)] transition-all duration-200">{t("logs.all")}</TabsTrigger>
            <TabsTrigger value="debug" className="rounded-full text-xs px-3 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-[0_0_15px_rgba(254,151,185,0.15)] transition-all duration-200">{t("logs.debug")}</TabsTrigger>
            <TabsTrigger value="info" className="rounded-full text-xs px-3 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-[0_0_15px_rgba(254,151,185,0.15)] transition-all duration-200">{t("logs.info")}</TabsTrigger>
            <TabsTrigger value="warn" className="rounded-full text-xs px-3 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-[0_0_15px_rgba(254,151,185,0.15)] transition-all duration-200">{t("logs.warn")}</TabsTrigger>
            <TabsTrigger value="error" className="rounded-full text-xs px-3 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-[0_0_15px_rgba(254,151,185,0.15)] transition-all duration-200">{t("logs.error")}</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder={t("logs.searchPlaceholder")} className="pl-9 bg-muted/30 border-white/[0.06] backdrop-blur-xl" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <Card className="flex-1 overflow-hidden rounded-xl border border-white/[0.06] bg-card/40 backdrop-blur-xl shadow-[0_0_20px_rgba(254,151,185,0.08)] animate-slide-up" style={{ animationDelay: "160ms" }}>
        <ScrollArea className="h-full" ref={scrollRef}>
          <CardContent className="p-0">
            <div className="divide-y divide-white/[0.04]">
              {filtered.map((entry) => (
                <div key={entry.id} className="flex items-center gap-3 px-4 py-2 text-xs font-mono hover:bg-white/[0.02] transition-colors duration-150">
                  <span className="shrink-0 text-muted-foreground">
                    {new Date(entry.timestamp).toLocaleTimeString(i18n.language)}
                  </span>
                  <Badge className={cn("shrink-0 text-[9px] uppercase border-0", levelStyles[entry.level])}>
                    {entry.level}
                  </Badge>
                  <span className="shrink-0 text-muted-foreground">[{entry.source}]</span>
                  <span className="min-w-0 truncate">{entry.message}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </ScrollArea>
      </Card>

      <div className="flex items-center justify-center gap-2 animate-slide-up" style={{ animationDelay: "240ms" }}>
        <p className="text-xs text-muted-foreground text-center">
          {t("logs.entriesShown", { count: filtered.length })}
        </p>
        <span className="text-xs text-muted-foreground/40">•</span>
        <span className={cn(
          "inline-flex items-center gap-1.5 text-xs",
          autoScroll ? "text-green-400" : "text-muted-foreground"
        )}>
          {autoScroll && <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />}
          {t("logs.autoScroll")} {autoScroll ? t("logs.on") : t("logs.off")}
        </span>
      </div>
    </div>
  );
}
