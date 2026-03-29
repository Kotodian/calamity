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

const levelStyles: Record<LogLevel, string> = {
  debug: "bg-muted text-muted-foreground",
  info: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  warn: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300",
  error: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
};

export function LogsPage() {
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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Logs</h1>
        <Button variant="outline" size="sm" onClick={clearLogs}>
          <Trash2 className="mr-2 h-3.5 w-3.5" /> Clear
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <Tabs value={filter ?? "all"} onValueChange={(v) => setFilter(v === "all" ? null : (v as LogLevel))}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="debug">Debug</TabsTrigger>
            <TabsTrigger value="info">Info</TabsTrigger>
            <TabsTrigger value="warn">Warn</TabsTrigger>
            <TabsTrigger value="error">Error</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search logs..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <Card className="flex-1 overflow-hidden">
        <ScrollArea className="h-full" ref={scrollRef}>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {filtered.map((entry) => (
                <div key={entry.id} className="flex items-start gap-3 px-4 py-2 text-xs font-mono">
                  <span className="shrink-0 text-muted-foreground w-20">
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </span>
                  <Badge className={cn("shrink-0 text-[9px] uppercase", levelStyles[entry.level])}>
                    {entry.level}
                  </Badge>
                  <span className="shrink-0 text-muted-foreground w-16">[{entry.source}]</span>
                  <span className="break-all">{entry.message}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </ScrollArea>
      </Card>

      <p className="text-xs text-muted-foreground text-center">
        {filtered.length} entries shown • Auto-scroll {autoScroll ? "on" : "off"}
      </p>
    </div>
  );
}
