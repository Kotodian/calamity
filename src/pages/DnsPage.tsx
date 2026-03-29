import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDnsStore } from "@/stores/dns";
import type { DnsMode } from "@/services/types";

export function DnsPage() {
  const { config, rules, cache, fetchConfig, updateConfig, fetchRules, addRule, deleteRule, fetchCache, clearCache } =
    useDnsStore();

  const [newDomain, setNewDomain] = useState("");
  const [newServer, setNewServer] = useState("");

  useEffect(() => {
    fetchConfig();
    fetchRules();
    fetchCache();
  }, [fetchConfig, fetchRules, fetchCache]);

  if (!config) return null;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold animate-slide-up">DNS</h1>

      <Tabs defaultValue="config">
        <TabsList className="animate-slide-up bg-muted/30 border border-white/[0.06] backdrop-blur-xl rounded-full p-1" style={{ animationDelay: "80ms" }}>
          <TabsTrigger value="config" className="rounded-full text-xs px-4 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-[0_0_15px_rgba(254,151,185,0.15)] transition-all duration-200">Configuration</TabsTrigger>
          <TabsTrigger value="rules" className="rounded-full text-xs px-4 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-[0_0_15px_rgba(254,151,185,0.15)] transition-all duration-200">DNS Rules</TabsTrigger>
          <TabsTrigger value="cache" className="rounded-full text-xs px-4 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-[0_0_15px_rgba(254,151,185,0.15)] transition-all duration-200">Cache</TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="space-y-4 mt-4">
          <Card className="animate-slide-up rounded-xl border border-white/[0.06] bg-card/40 backdrop-blur-xl shadow-[0_0_20px_rgba(254,151,185,0.08)] transition-all duration-200 hover:border-white/10 hover:bg-card/80" style={{ animationDelay: "160ms" }}>
            <CardHeader><CardTitle className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">DNS Mode</CardTitle></CardHeader>
            <CardContent>
              <Select value={config.mode} onValueChange={(v) => updateConfig({ mode: v as DnsMode })}>
                <SelectTrigger className="w-48 bg-muted/30 border-white/[0.06]"><SelectValue /></SelectTrigger>
                <SelectContent className="border-white/[0.06] bg-card/90 backdrop-blur-2xl">
                  <SelectItem value="fake-ip">Fake-IP</SelectItem>
                  <SelectItem value="redir-host">Redir-Host</SelectItem>
                  <SelectItem value="direct">Direct</SelectItem>
                </SelectContent>
              </Select>
              {config.mode === "fake-ip" && (
                <p className="mt-2 text-xs text-muted-foreground">Fake-IP range: {config.fakeIpRange}</p>
              )}
            </CardContent>
          </Card>

          <Card className="animate-slide-up rounded-xl border border-white/[0.06] bg-card/40 backdrop-blur-xl shadow-[0_0_20px_rgba(254,151,185,0.08)] transition-all duration-200 hover:border-white/10 hover:bg-card/80" style={{ animationDelay: "240ms" }}>
            <CardHeader><CardTitle className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">DNS Servers</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {config.servers.map((server) => (
                <div key={server.id} className="flex items-center gap-3 rounded-lg border border-white/[0.04] bg-muted/20 p-3 transition-all duration-200 hover:bg-muted/30">
                  <Switch
                    checked={server.enabled}
                    onCheckedChange={(checked) => {
                      const servers = config.servers.map((s) =>
                        s.id === server.id ? { ...s, enabled: checked } : s
                      );
                      updateConfig({ servers });
                    }}
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{server.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{server.address}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rules" className="space-y-4 mt-4">
          <Card className="animate-slide-up rounded-xl border border-white/[0.06] bg-card/40 backdrop-blur-xl shadow-[0_0_20px_rgba(254,151,185,0.08)]" style={{ animationDelay: "160ms" }}>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">DNS Rules</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input placeholder="Domain pattern (e.g. *.example.com)" value={newDomain} onChange={(e) => setNewDomain(e.target.value)} className="flex-1 bg-muted/30 border-white/[0.06]" />
                <Input placeholder="DNS server name" value={newServer} onChange={(e) => setNewServer(e.target.value)} className="w-40 bg-muted/30 border-white/[0.06]" />
                <Button size="icon" className="shadow-[0_0_15px_rgba(254,151,185,0.15)] transition-all duration-200" onClick={() => {
                  if (newDomain && newServer) {
                    addRule({ domain: newDomain, server: newServer, enabled: true });
                    setNewDomain("");
                    setNewServer("");
                  }
                }}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="space-y-2">
                {rules.map((rule) => (
                  <div key={rule.id} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-muted/20 p-3 transition-all duration-200 hover:border-white/10 hover:bg-muted/30">
                    <div className="flex-1">
                      <p className="text-sm font-mono">{rule.domain}</p>
                      <p className="text-xs text-muted-foreground">→ {rule.server}</p>
                    </div>
                    <Badge className={rule.enabled ? "bg-green-500/15 text-green-400 border-0" : "bg-muted/40 text-muted-foreground border-0"}>{rule.enabled ? "Active" : "Disabled"}</Badge>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-red-500/10 transition-all duration-200" onClick={() => deleteRule(rule.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cache" className="space-y-4 mt-4">
          <Card className="animate-slide-up rounded-xl border border-white/[0.06] bg-card/40 backdrop-blur-xl shadow-[0_0_20px_rgba(254,151,185,0.08)]" style={{ animationDelay: "160ms" }}>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">DNS Cache</CardTitle>
              <Button variant="outline" size="sm" className="border-white/[0.06] hover:bg-white/[0.04] transition-all duration-200" onClick={clearCache}>
                <Trash2 className="mr-2 h-3.5 w-3.5" /> Clear Cache
              </Button>
            </CardHeader>
            <CardContent>
              {cache.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Cache is empty</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="border-white/[0.04]">
                      <TableHead className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Domain</TableHead>
                      <TableHead className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">IP</TableHead>
                      <TableHead className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Type</TableHead>
                      <TableHead className="text-right text-[10px] font-medium text-muted-foreground uppercase tracking-wider">TTL</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cache.map((entry) => (
                      <TableRow key={entry.domain} className="border-white/[0.04] hover:bg-white/[0.02] transition-colors duration-150">
                        <TableCell className="font-mono text-xs">{entry.domain}</TableCell>
                        <TableCell className="font-mono text-xs">{entry.ip}</TableCell>
                        <TableCell><Badge variant="outline" className="text-[10px] border-white/[0.06] bg-muted/30">{entry.type}</Badge></TableCell>
                        <TableCell className="text-right text-xs">{entry.ttl}s</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
