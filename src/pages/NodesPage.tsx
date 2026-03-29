import { useEffect, useState } from "react";
import { Check, Wifi, Search, RefreshCw, X, Zap, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useNodesStore } from "@/stores/nodes";
import type { ProtocolConfig, ProxyNode } from "@/services/types";
import { cn } from "@/lib/utils";

function latencyColor(ms: number | null): string {
  if (ms === null) return "text-muted-foreground";
  if (ms < 80) return "text-green-400";
  if (ms < 150) return "text-yellow-400";
  return "text-red-400";
}

const flagEmoji: Record<string, string> = {
  JP: "\u{1F1EF}\u{1F1F5}", US: "\u{1F1FA}\u{1F1F8}", SG: "\u{1F1F8}\u{1F1EC}",
  HK: "\u{1F1ED}\u{1F1F0}", KR: "\u{1F1F0}\u{1F1F7}",
};

const countryFilters = ["All", "HK", "JP", "US", "SG", "KR"];

function QuickInfoPanel({ node, onClose, onConnect, onDelete }: { node: ProxyNode; onClose: () => void; onConnect: () => void; onDelete: (id: string) => void }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-card/90 backdrop-blur-2xl p-4 space-y-4 animate-slide-up shadow-[0_0_40px_rgba(0,0,0,0.4)]">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Quick Info</h3>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Current Node IP</p>
          <p className="text-sm font-mono bg-muted/30 rounded-lg px-3 py-1.5">{node.server}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Protocol</p>
          <div className="flex items-center gap-2">
            <Zap className="h-3.5 w-3.5 text-primary" />
            <span className="text-sm">{node.protocol}</span>
          </div>
        </div>
      </div>

      <Button onClick={onConnect} className="w-full bg-primary hover:bg-primary/90">
        <Zap className="mr-2 h-3.5 w-3.5" />
        Quick Connect
      </Button>

      <button
        onClick={onClose}
        className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
      >
        Disconnect
      </button>

      <button
        onClick={() => { onDelete(node.id); onClose(); }}
        className="w-full flex items-center justify-center gap-1.5 text-xs text-destructive hover:text-destructive/80 transition-colors py-1"
      >
        <Trash2 className="h-3 w-3" />
        Remove Node
      </button>
    </div>
  );
}

const inputCls = "bg-muted/30 border-white/[0.06]";

function ProtocolFields({ form, setForm }: { form: NodeForm; setForm: (f: NodeForm) => void }) {
  const F = (props: { placeholder: string; field: keyof NodeForm; type?: string }) => (
    <Input className={inputCls} placeholder={props.placeholder} type={props.type} value={form[props.field]} onChange={(e) => setForm({ ...form, [props.field]: e.target.value })} />
  );
  const S = (props: { field: keyof NodeForm; options: string[]; placeholder?: string }) => (
    <Select value={form[props.field]} onValueChange={(v) => setForm({ ...form, [props.field]: v })}>
      <SelectTrigger className={inputCls}><SelectValue placeholder={props.placeholder} /></SelectTrigger>
      <SelectContent>{props.options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
    </Select>
  );

  switch (form.protocol) {
    case "VMess":
      return (<>
        <F placeholder="UUID" field="uuid" />
        <div className="grid grid-cols-3 gap-2">
          <F placeholder="Alter ID" field="alterId" type="number" />
          <S field="security" options={["auto", "aes-128-gcm", "chacha20-poly1305", "none"]} />
          <S field="transport" options={["tcp", "ws", "grpc", "h2", "quic"]} />
        </div>
      </>);
    case "VLESS":
      return (<>
        <F placeholder="UUID" field="uuid" />
        <div className="grid grid-cols-2 gap-2">
          <S field="flow" options={["", "xtls-rprx-vision"]} placeholder="Flow (optional)" />
          <S field="transport" options={["tcp", "ws", "grpc", "h2", "quic"]} />
        </div>
      </>);
    case "Trojan":
      return (<>
        <F placeholder="Password" field="password" />
        <S field="transport" options={["tcp", "ws", "grpc", "h2", "quic"]} />
      </>);
    case "Shadowsocks":
      return (<>
        <F placeholder="Password" field="password" />
        <S field="method" options={["aes-128-gcm", "aes-256-gcm", "chacha20-ietf-poly1305", "2022-blake3-aes-128-gcm", "2022-blake3-aes-256-gcm"]} />
      </>);
    case "Hysteria2":
      return (<>
        <F placeholder="Password" field="password" />
        <div className="grid grid-cols-2 gap-2">
          <F placeholder="Up (Mbps)" field="upMbps" type="number" />
          <F placeholder="Down (Mbps)" field="downMbps" type="number" />
        </div>
        <F placeholder="Obfs Password (optional)" field="obfsPassword" />
      </>);
    case "TUIC":
      return (<>
        <F placeholder="UUID" field="uuid" />
        <F placeholder="Password" field="password" />
        <S field="congestionControl" options={["bbr", "cubic", "new_reno"]} />
      </>);
    case "AnyTLS":
      return (<>
        <F placeholder="Password" field="password" />
        <F placeholder="SNI" field="sni" />
        <F placeholder="Idle Timeout (seconds)" field="idleTimeout" type="number" />
      </>);
    default:
      return <p className="text-xs text-muted-foreground">Select a protocol</p>;
  }
}

function buildProtocolConfig(form: NodeForm): ProtocolConfig | undefined {
  switch (form.protocol) {
    case "VMess":
      return { type: "vmess", uuid: form.uuid, alterId: parseInt(form.alterId) || 0, security: form.security as "auto", transport: form.transport as "tcp" };
    case "VLESS":
      return { type: "vless", uuid: form.uuid, flow: form.flow as "", transport: form.transport as "tcp" };
    case "Trojan":
      return { type: "trojan", password: form.password, transport: form.transport as "tcp" };
    case "Shadowsocks":
      return { type: "shadowsocks", password: form.password, method: form.method as "aes-256-gcm" };
    case "Hysteria2":
      return { type: "hysteria2", password: form.password, upMbps: parseInt(form.upMbps) || 100, downMbps: parseInt(form.downMbps) || 200, obfsPassword: form.obfsPassword || undefined };
    case "TUIC":
      return { type: "tuic", uuid: form.uuid, password: form.password, congestionControl: form.congestionControl as "bbr" };
    case "AnyTLS":
      return { type: "anytls", password: form.password, sni: form.sni, idleTimeout: parseInt(form.idleTimeout) || 900 };
    default:
      return undefined;
  }
}

const defaultNodeForm = {
  name: "",
  server: "",
  port: "443",
  protocol: "VMess",
  country: "",
  countryCode: "",
  // Protocol-specific
  uuid: "",
  password: "",
  alterId: "0",
  security: "auto",
  transport: "tcp",
  flow: "",
  method: "aes-256-gcm",
  upMbps: "100",
  downMbps: "200",
  obfsPassword: "",
  congestionControl: "bbr",
  sni: "",
  idleTimeout: "900",
};

type NodeForm = typeof defaultNodeForm;

const protocols = ["VMess", "VLESS", "Trojan", "Shadowsocks", "Hysteria2", "TUIC", "AnyTLS"];
const countries = [
  { code: "JP", name: "Japan" },
  { code: "US", name: "United States" },
  { code: "SG", name: "Singapore" },
  { code: "HK", name: "Hong Kong" },
  { code: "KR", name: "South Korea" },
  { code: "DE", name: "Germany" },
  { code: "GB", name: "United Kingdom" },
];

export function NodesPage() {
  const { groups, selectedGroup, testing, fetchGroups, testAllLatency, setActiveNode, addNode, removeNode } =
    useNodesStore();
  const [search, setSearch] = useState("");
  const [countryFilter, setCountryFilter] = useState("All");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [form, setForm] = useState(defaultNodeForm);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  const currentGroup = groups.find((g) => g.id === selectedGroup);
  const allNodes = currentGroup?.nodes ?? [];
  const filteredNodes = allNodes.filter((node) => {
    if (countryFilter !== "All" && node.countryCode !== countryFilter) return false;
    if (search && !node.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const selectedNode = allNodes.find((n) => n.id === selectedNodeId);

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold">Nodes</h1>
          <span className="text-xs text-muted-foreground">
            Connected: <span className="text-primary font-medium">{allNodes.find((n) => n.active)?.name ?? "None"}</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search nodes"
              className="pl-8 w-44 h-8 text-xs bg-muted/30 border-white/[0.06]"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button
            onClick={() => { setForm(defaultNodeForm); setAddDialogOpen(true); }}
            className="h-8 w-8 rounded-lg border border-white/[0.06] bg-muted/30 flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/30 hover:shadow-[0_0_15px_rgba(254,151,185,0.1)] transition-all"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Country Filter Pills + Test All */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 rounded-lg bg-muted/30 p-0.5">
          {countryFilters.map((c) => (
            <button
              key={c}
              onClick={() => setCountryFilter(c)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200",
                countryFilter === c
                  ? "bg-primary text-primary-foreground shadow-[0_0_10px_rgba(254,151,185,0.15)]"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {c}
            </button>
          ))}
        </div>

        <Button
          variant="outline"
          size="sm"
          className="border-white/10 h-8 text-xs"
          onClick={testAllLatency}
          disabled={testing}
        >
          <RefreshCw className={cn("mr-1.5 h-3 w-3", testing && "animate-spin")} />
          {testing ? "Testing..." : "Test All"}
        </Button>
      </div>

      {/* Content: Grid + Quick Info Panel */}
      <div className="flex gap-4">
        {/* Node Grid */}
        <div className="flex-1 grid grid-cols-2 gap-3">
          {filteredNodes.map((node, i) => (
            <button
              key={node.id}
              onClick={() => {
                setSelectedNodeId(node.id);
              }}
              className={cn(
                "rounded-xl border p-4 text-left transition-all duration-200 hover:bg-card/80 animate-slide-up",
                node.active
                  ? "border-primary/30 bg-primary/[0.06] shadow-[0_0_25px_rgba(254,151,185,0.08)]"
                  : selectedNodeId === node.id
                    ? "border-white/15 bg-card/70"
                    : "border-white/[0.06] bg-card/40 hover:border-white/10"
              )}
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{flagEmoji[node.countryCode] ?? "\u{1F310}"}</span>
                  <div>
                    <p className="text-sm font-medium leading-tight">{node.name}</p>
                    {node.active && (
                      <span className="inline-flex items-center gap-1 text-[9px] font-bold text-primary uppercase tracking-wider mt-0.5">
                        <Check className="h-2.5 w-2.5" />
                        Active
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wifi className={cn("h-3 w-3", latencyColor(node.latency))} />
                  <span className={cn("text-xs font-mono font-semibold tabular-nums", latencyColor(node.latency))}>
                    {node.latency !== null ? `${node.latency}ms` : "—"}
                  </span>
                </div>
                <span className="text-[10px] text-muted-foreground">{node.protocol}</span>
              </div>
            </button>
          ))}
        </div>

        {/* Quick Info Panel */}
        {selectedNode && (
          <div className="w-60 shrink-0">
            <QuickInfoPanel
              node={selectedNode}
              onClose={() => setSelectedNodeId(null)}
              onConnect={() => {
                setActiveNode(selectedNode.id);
                setSelectedNodeId(null);
              }}
              onDelete={(id) => {
                removeNode(id);
                setSelectedNodeId(null);
              }}
            />
          </div>
        )}
      </div>

      {/* Connection Stability (for active node) */}
      {allNodes.find((n) => n.active) && (
        <div className="rounded-xl border border-white/[0.06] bg-card/40 backdrop-blur-xl p-5 animate-slide-up">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-medium">Connection Stability</h3>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Real-time latency analysis for {allNodes.find((n) => n.active)?.name}
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <div>
                <span className="text-muted-foreground">Avg Latency </span>
                <span className="font-semibold text-primary tabular-nums">{allNodes.find((n) => n.active)?.latency ?? 0} ms</span>
              </div>
              <div>
                <span className="text-muted-foreground">Jitter </span>
                <span className="font-semibold text-primary tabular-nums">1.2 ms</span>
              </div>
            </div>
          </div>

          {/* Stability bars */}
          <div className="flex items-end gap-1.5 h-20">
            {Array.from({ length: 20 }).map((_, i) => {
              const h = 30 + Math.random() * 60;
              const isHigh = h > 70;
              return (
                <div
                  key={i}
                  className={cn(
                    "flex-1 rounded-sm transition-all duration-300",
                    isHigh ? "bg-primary/60" : "bg-primary/25"
                  )}
                  style={{
                    height: `${h}%`,
                    animationDelay: `${i * 50}ms`,
                  }}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Add Node Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="bg-card/90 backdrop-blur-2xl border-white/[0.06] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Node</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Common fields */}
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5 block">Basic</label>
              <div className="space-y-3">
                <Input placeholder="Node name" className="bg-muted/30 border-white/[0.06]" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                <div className="grid grid-cols-3 gap-2">
                  <Input placeholder="Server address" className="bg-muted/30 border-white/[0.06] col-span-2" value={form.server} onChange={(e) => setForm({ ...form, server: e.target.value })} />
                  <Input placeholder="Port" type="number" className="bg-muted/30 border-white/[0.06]" value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Select value={form.protocol} onValueChange={(v) => setForm({ ...form, protocol: v })}>
                    <SelectTrigger className="bg-muted/30 border-white/[0.06]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {protocols.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={form.countryCode} onValueChange={(v) => { const c = countries.find((c) => c.code === v); setForm({ ...form, countryCode: v, country: c?.name ?? "" }); }}>
                    <SelectTrigger className="bg-muted/30 border-white/[0.06]"><SelectValue placeholder="Country" /></SelectTrigger>
                    <SelectContent>
                      {countries.map((c) => <SelectItem key={c.code} value={c.code}>{flagEmoji[c.code] ?? ""} {c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Protocol-specific fields */}
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5 block">{form.protocol} Config</label>
              <div className="space-y-3 rounded-lg border border-white/[0.04] bg-muted/10 p-3">
                <ProtocolFields form={form} setForm={setForm} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-white/10" onClick={() => setAddDialogOpen(false)}>Cancel</Button>
            <Button
              className="shadow-[0_0_15px_rgba(254,151,185,0.15)]"
              disabled={!form.name || !form.server || !form.countryCode}
              onClick={async () => {
                await addNode(selectedGroup, {
                  name: form.name,
                  server: form.server,
                  port: parseInt(form.port) || 443,
                  protocol: form.protocol,
                  country: form.country,
                  countryCode: form.countryCode,
                  protocolConfig: buildProtocolConfig(form),
                });
                setAddDialogOpen(false);
              }}
            >
              Add Node
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
