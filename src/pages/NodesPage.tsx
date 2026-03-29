import { useEffect, useState } from "react";
import { Check, Wifi, Search, RefreshCw, X, Zap, Plus, Trash2, ClipboardPaste, Link2, ArrowRight, Pencil } from "lucide-react";
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
import { countryFlag } from "@/lib/flags";
import { inferCountry } from "@/lib/proxy-uri";
import { parseMultipleUris } from "@/lib/proxy-uri";

function latencyColor(ms: number | null): string {
  if (ms === null) return "text-muted-foreground";
  if (ms < 80) return "text-green-400";
  if (ms < 150) return "text-yellow-400";
  return "text-red-400";
}

const countryFilters = ["All", "HK", "JP", "US", "SG", "KR", "DE", "GB"];

function QuickInfoPanel({ node, onClose, onConnect, onDisconnect, onEdit, onDelete, allNodes }: { node: ProxyNode; onClose: () => void; onConnect: () => void; onDisconnect: () => void; onEdit: (id: string) => void; onDelete: (id: string) => void; allNodes: ProxyNode[] }) {
  const isChain = node.protocol === "Chain" && node.protocolConfig?.type === "chain";
  const chainIds = isChain ? (node.protocolConfig as { chain: string[] }).chain : [];
  const chainHops = chainIds.map((id: string) => allNodes.find((n) => n.id === id)).filter(Boolean) as ProxyNode[];

  return (
    <div className="rounded-xl border border-white/[0.06] bg-card/90 backdrop-blur-2xl p-4 space-y-4 animate-slide-up shadow-[0_0_40px_rgba(0,0,0,0.4)]">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Quick Info</h3>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-3">
        {isChain ? (
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Chain Route</p>
            <div className="space-y-1.5">
              {chainHops.map((hop, i) => (
                <div key={hop.id} className="flex items-center gap-2">
                  <span className="text-[9px] text-muted-foreground w-3">{i + 1}</span>
                  <span className="text-xs">{countryFlag(hop.countryCode)}</span>
                  <span className="text-xs font-medium truncate">{hop.name}</span>
                  <span className="text-[9px] text-muted-foreground ml-auto">{hop.protocol}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
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
          </>
        )}
      </div>

      <Button onClick={onConnect} className="w-full bg-primary hover:bg-primary/90">
        <Zap className="mr-2 h-3.5 w-3.5" />
        Quick Connect
      </Button>

      {node.active && (
        <button
          onClick={() => { onDisconnect(); onClose(); }}
          className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
        >
          Disconnect
        </button>
      )}

      <button
        onClick={() => { onEdit(node.id); onClose(); }}
        className="w-full flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
      >
        <Pencil className="h-3 w-3" />
        Edit Node
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

const inputCls = "bg-muted/30 border-white/[0.06] h-8 text-xs";
const labelCls = "text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block";

function TlsFields({ form, setForm }: { form: NodeForm; setForm: (f: NodeForm) => void }) {
  const F = (props: { placeholder: string; field: keyof NodeForm; type?: string }) => (
    <Input className={inputCls} placeholder={props.placeholder} type={props.type} value={form[props.field]} onChange={(e) => setForm({ ...form, [props.field]: e.target.value })} />
  );
  return (
    <div className="space-y-2">
      <label className={labelCls}>TLS</label>
      <div className="grid grid-cols-2 gap-2">
        <Select value={form.tlsEnabled} onValueChange={(v) => setForm({ ...form, tlsEnabled: v })}>
          <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="true">TLS Enabled</SelectItem>
            <SelectItem value="false">TLS Disabled</SelectItem>
          </SelectContent>
        </Select>
        <F placeholder="SNI" field="sni" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <F placeholder="ALPN (comma separated)" field="alpn" />
        <Select value={form.insecure} onValueChange={(v) => setForm({ ...form, insecure: v })}>
          <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="false">Verify Certificate</SelectItem>
            <SelectItem value="true">Skip Verify</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {form.protocol === "VLESS" && (
        <>
          <label className={labelCls}>Reality</label>
          <div className="grid grid-cols-3 gap-2">
            <Select value={form.reality} onValueChange={(v) => setForm({ ...form, reality: v })}>
              <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="false">Disabled</SelectItem>
                <SelectItem value="true">Enabled</SelectItem>
              </SelectContent>
            </Select>
            <F placeholder="Public Key" field="realityPublicKey" />
            <F placeholder="Short ID" field="realityShortId" />
          </div>
        </>
      )}
    </div>
  );
}

function TransportFields({ form, setForm }: { form: NodeForm; setForm: (f: NodeForm) => void }) {
  const F = (props: { placeholder: string; field: keyof NodeForm }) => (
    <Input className={inputCls} placeholder={props.placeholder} value={form[props.field]} onChange={(e) => setForm({ ...form, [props.field]: e.target.value })} />
  );
  return (
    <div className="space-y-2">
      <label className={labelCls}>Transport</label>
      <Select value={form.transport} onValueChange={(v) => setForm({ ...form, transport: v })}>
        <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
        <SelectContent>
          {["tcp", "ws", "grpc", "h2", "quic"].map((t) => <SelectItem key={t} value={t}>{t.toUpperCase()}</SelectItem>)}
        </SelectContent>
      </Select>
      {form.transport === "ws" && (
        <div className="grid grid-cols-2 gap-2">
          <F placeholder="WS Path (e.g. /ws)" field="wsPath" />
          <F placeholder="WS Host Header" field="wsHost" />
        </div>
      )}
      {form.transport === "grpc" && (
        <F placeholder="gRPC Service Name" field="grpcServiceName" />
      )}
      {form.transport === "h2" && (
        <F placeholder="H2 Host (comma separated)" field="h2Host" />
      )}
    </div>
  );
}

function ChainFields({ form, setForm, allNodes }: { form: NodeForm; setForm: (f: NodeForm) => void; allNodes: ProxyNode[] }) {
  const availableNodes = allNodes.filter((n) => n.protocol !== "Chain");
  const chainNodes = form.chainNodeIds.map((id) => availableNodes.find((n) => n.id === id)).filter(Boolean) as ProxyNode[];

  return (
    <div className="space-y-3">
      <p className="text-[10px] text-muted-foreground">Select nodes in order. Traffic flows: Client → Node 1 → Node 2 → ... → Destination</p>

      {/* Current chain */}
      {chainNodes.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          {chainNodes.map((node, i) => (
            <div key={node.id} className="flex items-center gap-1">
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.06] bg-muted/40 px-2.5 py-1.5 text-xs">
                <span>{countryFlag(node.countryCode)}</span>
                <span className="font-medium">{node.name}</span>
                <span className="text-[9px] text-muted-foreground">{node.protocol}</span>
                <button
                  onClick={() => setForm({ ...form, chainNodeIds: form.chainNodeIds.filter((id) => id !== node.id) })}
                  className="text-muted-foreground hover:text-destructive ml-0.5"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
              {i < chainNodes.length - 1 && <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />}
            </div>
          ))}
        </div>
      )}

      {/* Add node to chain */}
      <Select
        value=""
        onValueChange={(nodeId) => {
          if (!form.chainNodeIds.includes(nodeId)) {
            setForm({ ...form, chainNodeIds: [...form.chainNodeIds, nodeId] });
          }
        }}
      >
        <SelectTrigger className={inputCls}>
          <SelectValue placeholder="Add node to chain..." />
        </SelectTrigger>
        <SelectContent>
          {availableNodes
            .filter((n) => !form.chainNodeIds.includes(n.id))
            .map((n) => (
              <SelectItem key={n.id} value={n.id}>
                {countryFlag(n.countryCode)} {n.name} ({n.protocol})
              </SelectItem>
            ))}
        </SelectContent>
      </Select>

      {form.chainNodeIds.length < 2 && (
        <p className="text-[10px] text-yellow-400">Add at least 2 nodes to form a chain</p>
      )}
    </div>
  );
}

function ProtocolFields({ form, setForm, allNodes }: { form: NodeForm; setForm: (f: NodeForm) => void; allNodes?: ProxyNode[] }) {
  const F = (props: { placeholder: string; field: keyof NodeForm; type?: string }) => (
    <Input className={inputCls} placeholder={props.placeholder} type={props.type} value={form[props.field] as string} onChange={(e) => setForm({ ...form, [props.field]: e.target.value })} />
  );
  const S = (props: { field: keyof NodeForm; options: string[]; placeholder?: string }) => (
    <Select value={form[props.field] as string} onValueChange={(v) => setForm({ ...form, [props.field]: v })}>
      <SelectTrigger className={inputCls}><SelectValue placeholder={props.placeholder} /></SelectTrigger>
      <SelectContent>{props.options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
    </Select>
  );

  switch (form.protocol) {
    case "VMess":
      return (<>
        <F placeholder="UUID" field="uuid" />
        <div className="grid grid-cols-2 gap-2">
          <F placeholder="Alter ID" field="alterId" type="number" />
          <S field="security" options={["auto", "aes-128-gcm", "chacha20-poly1305", "none"]} />
        </div>
        <TransportFields form={form} setForm={setForm} />
        <TlsFields form={form} setForm={setForm} />
      </>);
    case "VLESS":
      return (<>
        <F placeholder="UUID" field="uuid" />
        <S field="flow" options={["none", "xtls-rprx-vision"]} placeholder="Flow" />
        <TransportFields form={form} setForm={setForm} />
        <TlsFields form={form} setForm={setForm} />
      </>);
    case "Trojan":
      return (<>
        <F placeholder="Password" field="password" />
        <TransportFields form={form} setForm={setForm} />
        <TlsFields form={form} setForm={setForm} />
      </>);
    case "Shadowsocks":
      return (<>
        <F placeholder="Password" field="password" />
        <S field="method" options={["aes-128-gcm", "aes-256-gcm", "chacha20-ietf-poly1305", "2022-blake3-aes-128-gcm", "2022-blake3-aes-256-gcm"]} />
        <div className="grid grid-cols-2 gap-2">
          <S field="plugin" options={["none", "obfs-local", "v2ray-plugin"]} placeholder="Plugin" />
          <F placeholder="Plugin Opts" field="pluginOpts" />
        </div>
      </>);
    case "Hysteria2":
      return (<>
        <F placeholder="Password" field="password" />
        <div className="grid grid-cols-2 gap-2">
          <F placeholder="Up (Mbps)" field="upMbps" type="number" />
          <F placeholder="Down (Mbps)" field="downMbps" type="number" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <S field="obfsType" options={["none", "salamander"]} placeholder="Obfs Type" />
          <F placeholder="Obfs Password" field="obfsPassword" />
        </div>
        <TlsFields form={form} setForm={setForm} />
      </>);
    case "TUIC":
      return (<>
        <F placeholder="UUID" field="uuid" />
        <F placeholder="Password" field="password" />
        <div className="grid grid-cols-2 gap-2">
          <S field="congestionControl" options={["bbr", "cubic", "new_reno"]} />
          <S field="udpRelayMode" options={["native", "quic"]} placeholder="UDP Relay" />
        </div>
        <TlsFields form={form} setForm={setForm} />
      </>);
    case "AnyTLS":
      return (<>
        <F placeholder="Password" field="password" />
        <F placeholder="SNI" field="sni" />
        <div className="grid grid-cols-3 gap-2">
          <F placeholder="Idle Timeout (s)" field="idleTimeout" type="number" />
          <F placeholder="Min Padding" field="minPaddingLen" type="number" />
          <F placeholder="Max Padding" field="maxPaddingLen" type="number" />
        </div>
      </>);
    case "Chain":
      return <ChainFields form={form} setForm={setForm} allNodes={allNodes ?? []} />;
    default:
      return <p className="text-xs text-muted-foreground">Select a protocol</p>;
  }
}

function buildTls(form: NodeForm) {
  return {
    enabled: form.tlsEnabled === "true",
    sni: form.sni,
    alpn: form.alpn ? form.alpn.split(",").map((s) => s.trim()) : [],
    insecure: form.insecure === "true",
    reality: form.reality === "true",
    realityPublicKey: form.realityPublicKey,
    realityShortId: form.realityShortId,
  };
}

function buildTransport(form: NodeForm) {
  const t: { type: string; wsPath?: string; wsHeaders?: Record<string, string>; grpcServiceName?: string; h2Host?: string[] } = {
    type: form.transport,
  };
  if (form.transport === "ws") {
    t.wsPath = form.wsPath || "/";
    if (form.wsHost) t.wsHeaders = { Host: form.wsHost };
  }
  if (form.transport === "grpc") t.grpcServiceName = form.grpcServiceName;
  if (form.transport === "h2" && form.h2Host) t.h2Host = form.h2Host.split(",").map((s) => s.trim());
  return t as ProtocolConfig extends { transport: infer T } ? T : never;
}

function buildProtocolConfig(form: NodeForm): ProtocolConfig | undefined {
  switch (form.protocol) {
    case "VMess":
      return { type: "vmess", uuid: form.uuid, alterId: parseInt(form.alterId) || 0, security: form.security as "auto", transport: buildTransport(form) as never, tls: buildTls(form) };
    case "VLESS":
      return { type: "vless", uuid: form.uuid, flow: (form.flow === "none" ? "" : form.flow) as "", transport: buildTransport(form) as never, tls: buildTls(form) };
    case "Trojan":
      return { type: "trojan", password: form.password, transport: buildTransport(form) as never, tls: buildTls(form) };
    case "Shadowsocks":
      return { type: "shadowsocks", password: form.password, method: form.method as "aes-256-gcm", plugin: (form.plugin === "none" ? "" : form.plugin) as "", pluginOpts: form.pluginOpts };
    case "Hysteria2":
      return { type: "hysteria2", password: form.password, upMbps: parseInt(form.upMbps) || 100, downMbps: parseInt(form.downMbps) || 200, obfsType: (form.obfsType === "none" ? "" : form.obfsType) as "", obfsPassword: form.obfsPassword || undefined, tls: buildTls(form) };
    case "TUIC":
      return { type: "tuic", uuid: form.uuid, password: form.password, congestionControl: form.congestionControl as "bbr", udpRelayMode: form.udpRelayMode as "native", tls: buildTls(form) };
    case "AnyTLS":
      return { type: "anytls", password: form.password, sni: form.sni, idleTimeout: parseInt(form.idleTimeout) || 900, minPaddingLen: parseInt(form.minPaddingLen) || 0, maxPaddingLen: parseInt(form.maxPaddingLen) || 0 };
    case "Chain":
      return { type: "chain", chain: form.chainNodeIds };
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
  // Auth
  uuid: "",
  password: "",
  // VMess
  alterId: "0",
  security: "auto",
  // VLESS
  flow: "none",
  // Shadowsocks
  method: "aes-256-gcm",
  plugin: "none",
  pluginOpts: "",
  // Hysteria2
  upMbps: "100",
  downMbps: "200",
  obfsType: "none",
  obfsPassword: "",
  // TUIC
  congestionControl: "bbr",
  udpRelayMode: "native",
  // AnyTLS
  idleTimeout: "900",
  minPaddingLen: "0",
  maxPaddingLen: "0",
  // Transport
  transport: "tcp",
  wsPath: "",
  wsHost: "",
  grpcServiceName: "",
  h2Host: "",
  // TLS
  tlsEnabled: "true",
  sni: "",
  alpn: "",
  insecure: "false",
  reality: "false",
  realityPublicKey: "",
  realityShortId: "",
  // Chain
  chainNodeIds: [] as string[],
};

type NodeForm = typeof defaultNodeForm;

const protocols = ["VMess", "VLESS", "Trojan", "Shadowsocks", "Hysteria2", "TUIC", "AnyTLS", "Chain"];
const countries = [
  { code: "JP", name: "Japan" },
  { code: "US", name: "United States" },
  { code: "SG", name: "Singapore" },
  { code: "HK", name: "Hong Kong" },
  { code: "KR", name: "South Korea" },
  { code: "DE", name: "Germany" },
  { code: "GB", name: "United Kingdom" },
];

function nodeToForm(node: ProxyNode): NodeForm {
  const f = { ...defaultNodeForm };
  f.name = node.name;
  f.server = node.server;
  f.port = String(node.port);
  f.protocol = node.protocol;
  f.country = node.country;
  f.countryCode = node.countryCode;

  const c = node.protocolConfig;
  if (!c) return f;

  if (c.type === "vmess") {
    f.uuid = c.uuid; f.alterId = String(c.alterId); f.security = c.security;
    Object.assign(f, transportToForm(c.transport), tlsToForm(c.tls));
  } else if (c.type === "vless") {
    f.uuid = c.uuid; f.flow = c.flow || "none";
    Object.assign(f, transportToForm(c.transport), tlsToForm(c.tls));
  } else if (c.type === "trojan") {
    f.password = c.password;
    Object.assign(f, transportToForm(c.transport), tlsToForm(c.tls));
  } else if (c.type === "shadowsocks") {
    f.password = c.password; f.method = c.method;
    f.plugin = c.plugin || "none"; f.pluginOpts = c.pluginOpts || "";
  } else if (c.type === "hysteria2") {
    f.password = c.password; f.upMbps = String(c.upMbps); f.downMbps = String(c.downMbps);
    f.obfsType = c.obfsType || "none"; f.obfsPassword = c.obfsPassword || "";
    Object.assign(f, tlsToForm(c.tls));
  } else if (c.type === "tuic") {
    f.uuid = c.uuid; f.password = c.password;
    f.congestionControl = c.congestionControl; f.udpRelayMode = c.udpRelayMode;
    Object.assign(f, tlsToForm(c.tls));
  } else if (c.type === "anytls") {
    f.password = c.password; f.sni = c.sni;
    f.idleTimeout = String(c.idleTimeout); f.minPaddingLen = String(c.minPaddingLen); f.maxPaddingLen = String(c.maxPaddingLen);
  } else if (c.type === "chain") {
    f.chainNodeIds = [...c.chain];
  }
  return f;
}

function transportToForm(t: { type: string; wsPath?: string; wsHeaders?: Record<string, string>; grpcServiceName?: string; h2Host?: string[] }): Partial<NodeForm> {
  return {
    transport: t.type,
    wsPath: t.wsPath || "",
    wsHost: t.wsHeaders?.Host || "",
    grpcServiceName: t.grpcServiceName || "",
    h2Host: t.h2Host?.join(", ") || "",
  };
}

function tlsToForm(t: { enabled: boolean; sni: string; alpn: string[]; insecure: boolean; reality: boolean; realityPublicKey: string; realityShortId: string }): Partial<NodeForm> {
  return {
    tlsEnabled: String(t.enabled),
    sni: t.sni,
    alpn: t.alpn.join(", "),
    insecure: String(t.insecure),
    reality: String(t.reality),
    realityPublicKey: t.realityPublicKey,
    realityShortId: t.realityShortId,
  };
}

export function NodesPage() {
  const { groups, selectedGroup, testing, testingNodes, fetchGroups, selectGroup, testLatency, testAllLatency, setActiveNode, disconnectNode, addNode, updateNode, removeNode, addGroup, removeGroup, renameGroup } =
    useNodesStore();
  const [search, setSearch] = useState("");
  const [countryFilter, setCountryFilter] = useState("All");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [form, setForm] = useState(defaultNodeForm);
  const [newGroupName, setNewGroupName] = useState("");
  const [importCount, setImportCount] = useState<number | null>(null);

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
            onClick={async () => {
              try {
                const text = await navigator.clipboard.readText();
                const nodes = parseMultipleUris(text);
                if (nodes.length === 0) {
                  setImportCount(0);
                  setTimeout(() => setImportCount(null), 2000);
                  return;
                }
                for (const node of nodes) {
                  await addNode(selectedGroup, node);
                }
                setImportCount(nodes.length);
                setTimeout(() => setImportCount(null), 3000);
              } catch {
                setImportCount(0);
                setTimeout(() => setImportCount(null), 2000);
              }
            }}
            className="h-8 px-2 rounded-lg border border-white/[0.06] bg-muted/30 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary hover:border-primary/30 transition-all"
          >
            <ClipboardPaste className="h-3.5 w-3.5" />
            {importCount !== null ? (
              importCount > 0 ? <span className="text-green-400">+{importCount}</span> : <span className="text-red-400">No nodes</span>
            ) : (
              <span>Paste</span>
            )}
          </button>
          <button
            onClick={() => { setForm(defaultNodeForm); setEditingNodeId(null); setAddDialogOpen(true); }}
            className="h-8 w-8 rounded-lg border border-white/[0.06] bg-muted/30 flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/30 hover:shadow-[0_0_15px_rgba(254,151,185,0.1)] transition-all"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Group Tabs */}
      <div className="flex items-center gap-2">
        <div className="flex gap-1 rounded-lg bg-muted/30 p-0.5 flex-1">
          {groups.map((g) => (
            <button
              key={g.id}
              onClick={() => selectGroup(g.id)}
              onDoubleClick={() => {
                const name = prompt("Rename group:", g.name);
                if (name) renameGroup(g.id, name);
              }}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200 relative group",
                selectedGroup === g.id
                  ? "bg-primary text-primary-foreground shadow-[0_0_10px_rgba(254,151,185,0.15)]"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {g.name}
              {!["proxy", "auto"].includes(g.id) && selectedGroup === g.id && (
                <button
                  onClick={(e) => { e.stopPropagation(); removeGroup(g.id); }}
                  className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center text-[8px] opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="h-2 w-2" />
                </button>
              )}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <Input
            placeholder="New group"
            className="w-28 h-7 text-[10px] bg-muted/30 border-white/[0.06]"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newGroupName.trim()) {
                addGroup(newGroupName.trim());
                setNewGroupName("");
              }
            }}
          />
          <button
            onClick={() => { if (newGroupName.trim()) { addGroup(newGroupName.trim()); setNewGroupName(""); } }}
            className="h-7 w-7 rounded-md border border-white/[0.06] bg-muted/30 flex items-center justify-center text-muted-foreground hover:text-primary transition-colors"
          >
            <Plus className="h-3 w-3" />
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
                  {node.protocol === "Chain" ? (
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Link2 className="h-4 w-4" />
                    </span>
                  ) : (
                    <span className="text-xl">{countryFlag(node.countryCode)}</span>
                  )}
                  <div>
                    <p className="text-sm font-medium leading-tight">{node.name}</p>
                    {node.protocol === "Chain" && node.protocolConfig?.type === "chain" && (
                      <span className="text-[9px] text-muted-foreground">{(node.protocolConfig as { chain: string[] }).chain.length} hops</span>
                    )}
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
                <button
                  className="flex items-center gap-2 hover:opacity-70 transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation();
                    testLatency(node.id);
                  }}
                >
                  {testingNodes.has(node.id) ? (
                    <RefreshCw className="h-3 w-3 animate-spin text-muted-foreground" />
                  ) : (
                    <Wifi className={cn("h-3 w-3", latencyColor(node.latency))} />
                  )}
                  <span className={cn("text-xs font-mono font-semibold tabular-nums", testingNodes.has(node.id) ? "text-muted-foreground" : latencyColor(node.latency))}>
                    {testingNodes.has(node.id) ? "..." : node.latency !== null ? (node.latency === -1 ? "timeout" : `${node.latency}ms`) : "—"}
                  </span>
                </button>
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
              allNodes={groups.flatMap((g) => g.nodes)}
              onClose={() => setSelectedNodeId(null)}
              onConnect={() => {
                setActiveNode(selectedNode.id);
                setSelectedNodeId(null);
              }}
              onDisconnect={() => {
                disconnectNode();
                setSelectedNodeId(null);
              }}
              onEdit={(id) => {
                const n = allNodes.find((node) => node.id === id);
                if (n) {
                  setForm(nodeToForm(n));
                  setEditingNodeId(n.id);
                  setAddDialogOpen(true);
                }
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
            <DialogTitle>{editingNodeId ? "Edit Node" : "Add Node"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Common fields */}
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5 block">Basic</label>
              <div className="space-y-3">
                <Input placeholder="Node name" className="bg-muted/30 border-white/[0.06]" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                <div className={cn("grid gap-2", form.protocol === "Chain" ? "grid-cols-1" : "grid-cols-2")}>
                  <Select value={form.protocol} onValueChange={(v) => setForm({ ...form, protocol: v })}>
                    <SelectTrigger className="bg-muted/30 border-white/[0.06]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {protocols.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {form.protocol !== "Chain" && (
                    <Select value={form.countryCode} onValueChange={(v) => { const c = countries.find((c) => c.code === v); setForm({ ...form, countryCode: v, country: c?.name ?? "" }); }}>
                      <SelectTrigger className="bg-muted/30 border-white/[0.06]"><SelectValue placeholder="Country" /></SelectTrigger>
                      <SelectContent>
                        {countries.map((c) => <SelectItem key={c.code} value={c.code}>{countryFlag(c.code)} {c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                {form.protocol !== "Chain" && (
                  <div className="grid grid-cols-3 gap-2">
                    <Input placeholder="Server address" className="bg-muted/30 border-white/[0.06] col-span-2" value={form.server} onChange={(e) => setForm({ ...form, server: e.target.value })} />
                    <Input placeholder="Port" type="number" className="bg-muted/30 border-white/[0.06]" value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value })} />
                  </div>
                )}
              </div>
            </div>

            {/* Protocol-specific fields */}
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5 block">{form.protocol} Config</label>
              <div className="space-y-3 rounded-lg border border-white/[0.04] bg-muted/10 p-3">
                <ProtocolFields form={form} setForm={setForm} allNodes={groups.flatMap((g) => g.nodes)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-white/10" onClick={() => { setAddDialogOpen(false); setEditingNodeId(null); }}>Cancel</Button>
            <Button
              className="shadow-[0_0_15px_rgba(254,151,185,0.15)]"
              disabled={!form.name || (form.protocol !== "Chain" && !form.server) || (form.protocol === "Chain" && form.chainNodeIds.length < 2)}
              onClick={async () => {
                const inferred = !form.countryCode ? inferCountry(form.name) : { country: form.country, countryCode: form.countryCode };
                const input = {
                  name: form.name,
                  server: form.protocol === "Chain" ? "chain" : form.server,
                  port: form.protocol === "Chain" ? 0 : parseInt(form.port) || 443,
                  protocol: form.protocol,
                  country: inferred.country,
                  countryCode: inferred.countryCode,
                  protocolConfig: buildProtocolConfig(form),
                };
                if (editingNodeId) {
                  await updateNode(editingNodeId, input);
                } else {
                  await addNode(selectedGroup, input);
                }
                setAddDialogOpen(false);
                setEditingNodeId(null);
              }}
            >
              {editingNodeId ? "Save" : "Add Node"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
