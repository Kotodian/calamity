import { useEffect, useState } from "react";
import { Check, Wifi, Search, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useNodesStore } from "@/stores/nodes";
import { cn } from "@/lib/utils";

function latencyColor(ms: number | null): string {
  if (ms === null) return "text-muted-foreground";
  if (ms < 80) return "text-green-400";
  if (ms < 150) return "text-yellow-400";
  return "text-red-400";
}

function latencyBg(ms: number | null): string {
  if (ms === null) return "bg-muted/50";
  if (ms < 80) return "bg-green-500/10";
  if (ms < 150) return "bg-yellow-500/10";
  return "bg-red-500/10";
}

const flagEmoji: Record<string, string> = {
  JP: "\u{1F1EF}\u{1F1F5}", US: "\u{1F1FA}\u{1F1F8}", SG: "\u{1F1F8}\u{1F1EC}",
  HK: "\u{1F1ED}\u{1F1F0}", KR: "\u{1F1F0}\u{1F1F7}",
};

const countryFilters = ["All", "JP", "US", "SG", "HK", "KR"];

export function NodesPage() {
  const { groups, selectedGroup, testing, fetchGroups, selectGroup, testAllLatency, setActiveNode } =
    useNodesStore();
  const [search, setSearch] = useState("");
  const [countryFilter, setCountryFilter] = useState("All");

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  const currentGroup = groups.find((g) => g.id === selectedGroup);
  const filteredNodes = currentGroup?.nodes.filter((node) => {
    if (countryFilter !== "All" && node.countryCode !== countryFilter) return false;
    if (search && !node.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }) ?? [];

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Nodes</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {filteredNodes.length} nodes • {filteredNodes.filter((n) => n.latency !== null && n.latency < 100).length} optimal
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="border-white/10"
          onClick={testAllLatency}
          disabled={testing}
        >
          <RefreshCw className={cn("mr-1.5 h-3 w-3", testing && "animate-spin")} />
          {testing ? "Testing..." : "Test All"}
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="flex gap-1 rounded-lg bg-muted/30 p-0.5">
          {countryFilters.map((c) => (
            <button
              key={c}
              onClick={() => setCountryFilter(c)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                countryFilter === c
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {c}
            </button>
          ))}
        </div>

        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search nodes..."
            className="pl-9 bg-muted/30 border-white/[0.06]"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex gap-1 rounded-lg bg-muted/30 p-0.5">
          {groups.map((g) => (
            <button
              key={g.id}
              onClick={() => selectGroup(g.id)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                selectedGroup === g.id
                  ? "bg-card text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {g.name}
            </button>
          ))}
        </div>
      </div>

      {/* Node List */}
      <div className="space-y-2">
        {filteredNodes.map((node) => (
          <button
            key={node.id}
            onClick={() => setActiveNode(node.id)}
            className={cn(
              "w-full rounded-xl border p-4 text-left transition-all hover:bg-card/80",
              node.active
                ? "border-primary/30 bg-primary/[0.04] shadow-[0_0_20px_rgba(254,151,185,0.08)]"
                : "border-white/[0.06] bg-card/40"
            )}
          >
            <div className="flex items-center gap-4">
              <span className="text-2xl shrink-0">
                {flagEmoji[node.countryCode] ?? "\u{1F310}"}
              </span>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{node.name}</span>
                  {node.active && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-500/15 px-2 py-0.5 text-[10px] font-semibold text-green-400">
                      <Check className="h-2.5 w-2.5" />
                      Active
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {node.protocol} • {node.server}
                </p>
              </div>

              <div className={cn(
                "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5",
                latencyBg(node.latency)
              )}>
                <Wifi className={cn("h-3 w-3", latencyColor(node.latency))} />
                <span className={cn("text-sm font-mono font-semibold tabular-nums", latencyColor(node.latency))}>
                  {node.latency !== null ? `${node.latency}ms` : "—"}
                </span>
              </div>
            </div>

            {node.active && (
              <div className="mt-3 pt-3 border-t border-white/[0.06] flex items-center gap-6">
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg Latency</span>
                  <p className="text-sm font-semibold tabular-nums">{node.latency}ms</p>
                </div>
                <div className="h-6 w-px bg-white/10" />
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Jitter</span>
                  <p className="text-sm font-semibold tabular-nums">1.2ms</p>
                </div>
                <div className="h-6 w-px bg-white/10" />
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Stability</span>
                  <Badge variant="outline" className="text-[10px] border-green-500/30 text-green-400">Excellent</Badge>
                </div>
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
