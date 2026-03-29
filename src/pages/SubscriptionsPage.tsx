import { useEffect, useState } from "react";
import { Plus, RefreshCw, Trash2, Copy, Link, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSubscriptionsStore } from "@/stores/subscriptions";
import type { AutoUpdateInterval } from "@/services/subscriptions";
import { cn } from "@/lib/utils";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0";
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes < 1024 * 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  return `${(bytes / (1024 * 1024 * 1024 * 1024)).toFixed(2)} TB`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)} min ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

export function SubscriptionsPage() {
  const { subscriptions, fetchSubscriptions, addSubscription, removeSubscription, updateSubscription, toggleSubscription, setAutoUpdateInterval } =
    useSubscriptionsStore();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");

  useEffect(() => {
    fetchSubscriptions();
  }, [fetchSubscriptions]);

  const totalNodes = subscriptions.reduce((acc, s) => acc + (s.enabled ? s.nodeCount : 0), 0);
  const totalTrafficUsed = subscriptions.reduce((acc, s) => acc + s.trafficUsed, 0);
  const totalTrafficTotal = subscriptions.reduce((acc, s) => acc + s.trafficTotal, 0);
  const activeCount = subscriptions.filter((s) => s.enabled).length;

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between animate-slide-up">
        <div>
          <h1 className="text-xl font-semibold">Subscriptions</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Manage proxy subscription links</p>
        </div>
      </div>

      {/* Add Subscription */}
      <div className="rounded-xl border border-white/[0.06] bg-card/40 backdrop-blur-xl p-4 animate-slide-up" style={{ animationDelay: "80ms" }}>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Link className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Subscription URL"
              className="pl-9 bg-muted/30 border-white/[0.06] h-9 text-xs font-mono"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>
          <Input
            placeholder="Name"
            className="w-40 bg-muted/30 border-white/[0.06] h-9 text-xs"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button
            className="h-9 text-xs shadow-[0_0_15px_rgba(254,151,185,0.15)]"
            disabled={!url}
            onClick={() => {
              addSubscription(name || "Untitled", url);
              setName("");
              setUrl("");
            }}
          >
            <Plus className="mr-1.5 h-3 w-3" /> Add
          </Button>
        </div>
      </div>

      {/* Subscription Cards */}
      <div className="space-y-3">
        {subscriptions.map((sub, i) => (
          <div
            key={sub.id}
            className={cn(
              "rounded-xl border bg-card/40 backdrop-blur-xl p-5 space-y-3 transition-all duration-200 animate-slide-up",
              sub.enabled ? "border-white/[0.06]" : "border-white/[0.04] opacity-60"
            )}
            style={{ animationDelay: `${(i + 2) * 80}ms` }}
          >
            {/* Row 1: Name + Toggle */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-sm">{sub.name}</h3>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[9px] uppercase",
                    sub.status === "active" && "border-green-500/30 bg-green-500/10 text-green-400",
                    sub.status === "updating" && "border-yellow-500/30 bg-yellow-500/10 text-yellow-400",
                    sub.status === "error" && "border-red-500/30 bg-red-500/10 text-red-400"
                  )}
                >
                  {sub.status === "updating" && <Loader2 className="mr-1 h-2 w-2 animate-spin" />}
                  {sub.status}
                </Badge>
              </div>
              <Switch
                checked={sub.enabled}
                onCheckedChange={(v) => toggleSubscription(sub.id, v)}
              />
            </div>

            {/* Row 2: URL */}
            <div className="flex items-center gap-2">
              <p className="text-[11px] font-mono text-muted-foreground truncate flex-1">{sub.url}</p>
              <button
                onClick={() => navigator.clipboard?.writeText(sub.url)}
                className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
              >
                <Copy className="h-3 w-3" />
              </button>
            </div>

            {/* Row 3: Stats */}
            <div className="flex items-center gap-4 text-xs">
              <span className="text-muted-foreground">
                <span className="font-semibold text-foreground">{sub.nodeCount}</span> nodes
              </span>
              <div className="h-3 w-px bg-white/10" />
              <span className="text-muted-foreground">Updated {timeAgo(sub.lastUpdated)}</span>
              <div className="h-3 w-px bg-white/10" />
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">Auto:</span>
                <Select
                  value={sub.autoUpdateInterval}
                  onValueChange={(v) => setAutoUpdateInterval(sub.id, v as AutoUpdateInterval)}
                >
                  <SelectTrigger className="h-6 w-16 bg-muted/30 border-white/[0.06] text-[10px] px-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1h">1h</SelectItem>
                    <SelectItem value="6h">6h</SelectItem>
                    <SelectItem value="12h">12h</SelectItem>
                    <SelectItem value="24h">24h</SelectItem>
                    <SelectItem value="never">Off</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Row 4: Traffic Bar */}
            {sub.trafficTotal > 0 && (
              <div className="space-y-1">
                <div className="h-1.5 rounded-full bg-muted/30 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-primary to-pink-400 transition-all duration-500"
                    style={{ width: `${Math.min(100, (sub.trafficUsed / sub.trafficTotal) * 100)}%` }}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {formatBytes(sub.trafficUsed)} / {formatBytes(sub.trafficTotal)}
                </p>
              </div>
            )}

            {/* Row 5: Actions */}
            <div className="flex items-center justify-end gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-[11px] border-white/[0.06]"
                onClick={() => updateSubscription(sub.id)}
                disabled={sub.status === "updating"}
              >
                <RefreshCw className={cn("mr-1 h-3 w-3", sub.status === "updating" && "animate-spin")} />
                Update Now
              </Button>
              <button
                onClick={() => removeSubscription(sub.id)}
                className="text-muted-foreground hover:text-destructive transition-colors p-1"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Bottom Stats */}
      <div className="flex items-center justify-center gap-6 text-xs text-muted-foreground animate-slide-up" style={{ animationDelay: "400ms" }}>
        <span><span className="font-semibold text-foreground">{activeCount}</span> active subscriptions</span>
        <div className="h-3 w-px bg-white/10" />
        <span><span className="font-semibold text-foreground">{totalNodes}</span> total nodes</span>
        {totalTrafficTotal > 0 && (
          <>
            <div className="h-3 w-px bg-white/10" />
            <span>{formatBytes(totalTrafficUsed)} / {formatBytes(totalTrafficTotal)}</span>
          </>
        )}
      </div>
    </div>
  );
}
