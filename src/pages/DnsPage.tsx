import { useEffect, useState } from "react";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDnsStore } from "@/stores/dns";
import { useSettingsStore } from "@/stores/settings";
import { useNodesStore } from "@/stores/nodes";
import { useRulesStore } from "@/stores/rules";
import type { DnsMode } from "@/services/types";

const PRESET_SERVERS = [
  { id: "cf-https", name: "Cloudflare", address: "https://1.1.1.1/dns-query" },
  { id: "cf-tls", name: "Cloudflare TLS", address: "tls://1.1.1.1" },
  { id: "google-https", name: "Google", address: "https://8.8.8.8/dns-query" },
  { id: "google-tls", name: "Google TLS", address: "tls://8.8.8.8" },
  { id: "ali-udp", name: "AliDNS", address: "223.5.5.5" },
  { id: "ali-https", name: "AliDNS HTTPS", address: "https://223.5.5.5/dns-query" },
  { id: "dnspod-https", name: "DNSPod", address: "https://1.12.12.12/dns-query" },
  { id: "tailscale", name: "Tailscale", address: "100.100.100.100" },
] as const;

const MATCH_TYPES = [
  { value: "domain", label: "Domain" },
  { value: "domain-suffix", label: "Domain Suffix" },
  { value: "domain-keyword", label: "Domain Keyword" },
  { value: "domain-regex", label: "Domain Regex" },
  { value: "rule_set", label: "Rule Set" },
] as const;

export function DnsPage() {
  const {
    config,
    rules,
    fetchAll,
    updateConfig,
    addServer,
    updateServer,
    deleteServer,
    addRule,
    deleteRule,
  } = useDnsStore();

  const [newMatchType, setNewMatchType] = useState("domain-suffix");
  const [newMatchValue, setNewMatchValue] = useState("");
  const [newRuleServer, setNewRuleServer] = useState("");
  const [showPresets, setShowPresets] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customAddress, setCustomAddress] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const settings = useSettingsStore((s) => s.settings);
  const fetchSettings = useSettingsStore((s) => s.fetchSettings);
  const tunEnabled = settings?.enhancedMode ?? false;

  const nodeGroups = useNodesStore((s) => s.groups);
  const fetchNodes = useNodesStore((s) => s.fetchGroups);
  const outboundOptions = nodeGroups.flatMap((g) => g.nodes.map((n) => ({ value: n.id, label: n.name })));

  const routeRules = useRulesStore((s) => s.rules);
  const fetchRouteRules = useRulesStore((s) => s.fetchRules);
  const ruleSetOptions = routeRules
    .filter((r) => r.matchType === "geosite" || r.matchType === "geoip")
    .map((r) => ({ value: `${r.matchType}-${r.matchValue}`, label: `${r.matchType}-${r.matchValue}` }));

  useEffect(() => {
    fetchAll();
    fetchSettings();
    fetchNodes();
    fetchRouteRules();
  }, [fetchAll, fetchSettings, fetchNodes, fetchRouteRules]);

  if (!config) return null;

  const existingServerIds = new Set(config.servers.map((s) => s.id));
  const availablePresets = PRESET_SERVERS.filter((p) => !existingServerIds.has(p.id));

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold animate-slide-up">DNS</h1>

      <Tabs defaultValue="config">
        <TabsList
          className="animate-slide-up bg-muted/30 border border-white/[0.06] backdrop-blur-xl rounded-full p-1"
          style={{ animationDelay: "80ms" }}
        >
          <TabsTrigger
            value="config"
            className="rounded-full text-xs px-4 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-[0_0_15px_rgba(254,151,185,0.15)] transition-all duration-200"
          >
            Configuration
          </TabsTrigger>
          <TabsTrigger
            value="rules"
            className="rounded-full text-xs px-4 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-[0_0_15px_rgba(254,151,185,0.15)] transition-all duration-200"
          >
            DNS Rules
          </TabsTrigger>
        </TabsList>

        {/* ---- Configuration Tab ---- */}
        <TabsContent value="config" className="space-y-4 mt-4">
          {/* DNS Mode */}
          <Card
            className="animate-slide-up rounded-xl border border-white/[0.06] bg-card/40 backdrop-blur-xl shadow-[0_0_20px_rgba(254,151,185,0.08)] transition-all duration-200 hover:border-white/10 hover:bg-card/80"
            style={{ animationDelay: "160ms" }}
          >
            <CardHeader>
              <CardTitle className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                DNS Mode
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Select
                value={config.mode}
                onValueChange={(v) => updateConfig({ mode: v as DnsMode })}
              >
                <SelectTrigger className="w-48 bg-muted/30 border-white/[0.06]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-white/[0.06] bg-card/90 backdrop-blur-2xl">
                  <SelectItem value="fake-ip" disabled={!tunEnabled}>
                    Fake-IP{!tunEnabled ? " (requires TUN)" : ""}
                  </SelectItem>
                  <SelectItem value="redir-host">Redir-Host</SelectItem>
                  <SelectItem value="direct">Direct</SelectItem>
                </SelectContent>
              </Select>
              {config.mode === "fake-ip" && (
                <p className="text-xs text-muted-foreground">
                  Fake-IP range: {config.fakeIpRange}
                </p>
              )}
            </CardContent>
          </Card>

          {/* DNS Servers */}
          <Card
            className="animate-slide-up rounded-xl border border-white/[0.06] bg-card/40 backdrop-blur-xl shadow-[0_0_20px_rgba(254,151,185,0.08)] transition-all duration-200 hover:border-white/10 hover:bg-card/80"
            style={{ animationDelay: "240ms" }}
          >
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                DNS Servers
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                className="border-white/[0.06] hover:bg-white/[0.04] text-xs"
                onClick={() => setShowPresets(!showPresets)}
              >
                <Plus className="mr-1 h-3 w-3" />
                Add Server
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Preset picker */}
              {showPresets && (
                <div className="space-y-3 rounded-lg border border-white/[0.06] bg-muted/10 p-3">
                  {availablePresets.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                        Presets
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {availablePresets.map((preset) => (
                          <Badge
                            key={preset.id}
                            variant="outline"
                            className="cursor-pointer text-[10px] hover:bg-primary/10 transition-colors"
                            onClick={async () => {
                              setBusyAction(`preset-${preset.id}`);
                              try {
                                await addServer({
                                  id: preset.id,
                                  name: preset.name,
                                  address: preset.address,
                                  enabled: true,
                                });
                              } finally { setBusyAction(null); }
                            }}
                          >
                            <Plus className="mr-1 h-2.5 w-2.5" />
                            {preset.name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="space-y-1">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                      Custom
                    </p>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Name"
                        value={customName}
                        onChange={(e) => setCustomName(e.target.value)}
                        className="w-32 bg-muted/30 border-white/[0.06] text-xs"
                      />
                      <Input
                        placeholder="Address (e.g. https://... or tls://... or IP)"
                        value={customAddress}
                        onChange={(e) => setCustomAddress(e.target.value)}
                        className="flex-1 bg-muted/30 border-white/[0.06] text-xs"
                      />
                      <Button
                        size="sm"
                        disabled={!customName || !customAddress || !!busyAction}
                        onClick={async () => {
                          setBusyAction("add-server");
                          try {
                            const id = `custom-${Date.now()}`;
                            await addServer({
                              id,
                              name: customName,
                              address: customAddress,
                              enabled: true,
                            });
                            setCustomName("");
                            setCustomAddress("");
                          } finally { setBusyAction(null); }
                        }}
                      >
                        {busyAction === "add-server" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Server list */}
              {config.servers.map((server) => (
                <div
                  key={server.id}
                  className="flex items-center gap-3 rounded-lg border border-white/[0.04] bg-muted/20 p-3 transition-all duration-200 hover:bg-muted/30"
                >
                  <Switch
                    checked={server.enabled}
                    disabled={!!busyAction}
                    onCheckedChange={async (checked) => {
                      setBusyAction(`toggle-${server.id}`);
                      try { await updateServer({ ...server, enabled: checked }); }
                      finally { setBusyAction(null); }
                    }}
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{server.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{server.address}</p>
                  </div>
                  <Select
                    value={server.detour ?? "direct"}
                    onValueChange={async (v) => {
                      setBusyAction(`detour-${server.id}`);
                      try { await updateServer({ ...server, detour: v === "direct" ? undefined : v }); }
                      finally { setBusyAction(null); }
                    }}
                  >
                    <SelectTrigger className="w-32 h-7 bg-muted/30 border-white/[0.06] text-[10px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-white/[0.06] bg-card/90 backdrop-blur-2xl">
                      <SelectItem value="direct">Direct</SelectItem>
                      {outboundOptions.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:bg-red-500/10 transition-all duration-200"
                    disabled={!!busyAction}
                    onClick={async () => {
                      setBusyAction(`del-server-${server.id}`);
                      try { await deleteServer(server.id); }
                      finally { setBusyAction(null); }
                    }}
                  >
                    {busyAction === `del-server-${server.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---- Rules Tab ---- */}
        <TabsContent value="rules" className="space-y-4 mt-4">
          <Card
            className="animate-slide-up rounded-xl border border-white/[0.06] bg-card/40 backdrop-blur-xl shadow-[0_0_20px_rgba(254,151,185,0.08)]"
            style={{ animationDelay: "160ms" }}
          >
            <CardHeader>
              <CardTitle className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                DNS Rules
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Add rule form */}
              <div className="flex gap-2">
                <Select value={newMatchType} onValueChange={setNewMatchType}>
                  <SelectTrigger className="w-40 bg-muted/30 border-white/[0.06] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-white/[0.06] bg-card/90 backdrop-blur-2xl">
                    {MATCH_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {newMatchType === "rule_set" ? (
                  <Select value={newMatchValue || undefined} onValueChange={setNewMatchValue}>
                    <SelectTrigger className="flex-1 bg-muted/30 border-white/[0.06] text-xs">
                      <SelectValue placeholder="Select rule set..." />
                    </SelectTrigger>
                    <SelectContent className="border-white/[0.06] bg-card/90 backdrop-blur-2xl">
                      {ruleSetOptions.map((rs) => (
                        <SelectItem key={rs.value} value={rs.value}>
                          {rs.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    placeholder="Value (e.g. .cn)"
                    value={newMatchValue}
                    onChange={(e) => setNewMatchValue(e.target.value)}
                    className="flex-1 bg-muted/30 border-white/[0.06] text-xs"
                  />
                )}
                <Select value={newRuleServer} onValueChange={setNewRuleServer}>
                  <SelectTrigger className="w-40 bg-muted/30 border-white/[0.06] text-xs">
                    <SelectValue placeholder="Server" />
                  </SelectTrigger>
                  <SelectContent className="border-white/[0.06] bg-card/90 backdrop-blur-2xl">
                    {config.servers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="icon"
                  className="shadow-[0_0_15px_rgba(254,151,185,0.15)] transition-all duration-200"
                  disabled={!newMatchValue || !newRuleServer || !!busyAction}
                  onClick={async () => {
                    setBusyAction("add-rule");
                    try {
                      await addRule({
                        id: `dr-${Date.now()}`,
                        matchType: newMatchType as "domain" | "domain-suffix" | "domain-keyword" | "domain-regex",
                        matchValue: newMatchValue,
                        server: newRuleServer,
                        enabled: true,
                      });
                      setNewMatchValue("");
                      setNewRuleServer("");
                    } finally { setBusyAction(null); }
                  }}
                >
                  {busyAction === "add-rule" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                </Button>
              </div>

              {/* Rules list */}
              <div className="space-y-2">
                {rules.map((rule) => {
                  const serverName =
                    config.servers.find((s) => s.id === rule.server)?.name ?? rule.server;
                  const matchLabel =
                    MATCH_TYPES.find((t) => t.value === rule.matchType)?.label ?? rule.matchType;
                  return (
                    <div
                      key={rule.id}
                      className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-muted/20 p-3 transition-all duration-200 hover:border-white/10 hover:bg-muted/30"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className="text-[10px] border-white/[0.06] bg-muted/30"
                          >
                            {matchLabel}
                          </Badge>
                          <p className="text-sm font-mono">{rule.matchValue}</p>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">→ {serverName}</p>
                      </div>
                      <Badge
                        className={
                          rule.enabled
                            ? "bg-green-500/15 text-green-400 border-0"
                            : "bg-muted/40 text-muted-foreground border-0"
                        }
                      >
                        {rule.enabled ? "Active" : "Disabled"}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:bg-red-500/10 transition-all duration-200"
                        disabled={!!busyAction}
                        onClick={async () => {
                          setBusyAction(`del-rule-${rule.id}`);
                          try { await deleteRule(rule.id); }
                          finally { setBusyAction(null); }
                        }}
                      >
                        {busyAction === `del-rule-${rule.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  );
                })}
                {rules.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No DNS rules configured
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
