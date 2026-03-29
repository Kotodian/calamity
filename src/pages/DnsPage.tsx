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
      <h1 className="text-2xl font-semibold">DNS</h1>

      <Tabs defaultValue="config">
        <TabsList>
          <TabsTrigger value="config">Configuration</TabsTrigger>
          <TabsTrigger value="rules">DNS Rules</TabsTrigger>
          <TabsTrigger value="cache">Cache</TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="space-y-4 mt-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">DNS Mode</CardTitle></CardHeader>
            <CardContent>
              <Select value={config.mode} onValueChange={(v) => updateConfig({ mode: v as DnsMode })}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
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

          <Card>
            <CardHeader><CardTitle className="text-sm">DNS Servers</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {config.servers.map((server) => (
                <div key={server.id} className="flex items-center gap-3">
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
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm">DNS Rules</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input placeholder="Domain pattern (e.g. *.example.com)" value={newDomain} onChange={(e) => setNewDomain(e.target.value)} className="flex-1" />
                <Input placeholder="DNS server name" value={newServer} onChange={(e) => setNewServer(e.target.value)} className="w-40" />
                <Button size="icon" onClick={() => {
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
                  <div key={rule.id} className="flex items-center gap-3 rounded-lg border p-3">
                    <div className="flex-1">
                      <p className="text-sm font-mono">{rule.domain}</p>
                      <p className="text-xs text-muted-foreground">→ {rule.server}</p>
                    </div>
                    <Badge variant={rule.enabled ? "default" : "secondary"}>{rule.enabled ? "Active" : "Disabled"}</Badge>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteRule(rule.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cache" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm">DNS Cache</CardTitle>
              <Button variant="outline" size="sm" onClick={clearCache}>
                <Trash2 className="mr-2 h-3.5 w-3.5" /> Clear Cache
              </Button>
            </CardHeader>
            <CardContent>
              {cache.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Cache is empty</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Domain</TableHead>
                      <TableHead>IP</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">TTL</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cache.map((entry) => (
                      <TableRow key={entry.domain}>
                        <TableCell className="font-mono text-xs">{entry.domain}</TableCell>
                        <TableCell className="font-mono text-xs">{entry.ip}</TableCell>
                        <TableCell><Badge variant="outline" className="text-[10px]">{entry.type}</Badge></TableCell>
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
