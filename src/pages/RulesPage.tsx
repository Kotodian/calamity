import { useEffect, useState } from "react";
import { GripVertical, Plus, Trash2, Pencil, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useRulesStore } from "@/stores/rules";
import { useNodesStore } from "@/stores/nodes";
import type { OutboundType, RouteRule } from "@/services/types";
import { cn } from "@/lib/utils";

const outboundColors: Record<string, string> = {
  proxy: "border-l-primary",
  direct: "border-l-green-500",
  reject: "border-l-red-500",
  tailnet: "border-l-blue-500",
};

function SortableRule({
  rule,
  index,
  onToggle,
  onEdit,
  onDelete,
}: {
  rule: RouteRule;
  index: number;
  onToggle: () => Promise<void>;
  onEdit: () => void;
  onDelete: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState<"toggle" | "delete" | null>(null);
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: rule.id });
  const style = { transform: CSS.Transform.toString(transform), transition, animationDelay: `${index * 80}ms` };
  const outboundLabels: Record<string, string> = {
    proxy: t("common.outbound.proxy"),
    direct: t("common.outbound.direct"),
    reject: t("common.outbound.reject"),
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={cn(
        "animate-slide-up border-l-4 rounded-xl border border-white/[0.06] bg-card/40 backdrop-blur-xl shadow-[0_0_20px_rgba(254,151,185,0.08)] transition-all duration-200 hover:border-white/10 hover:bg-card/80",
        outboundColors[rule.outbound],
        !rule.enabled && "opacity-50"
      )}
    >
      <CardContent className="flex items-center gap-3 p-3">
        <button {...attributes} {...listeners} className="cursor-grab text-muted-foreground hover:text-foreground transition-colors duration-200">
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{rule.name}</span>
            <Badge variant="outline" className="text-[10px] border-white/[0.06] bg-muted/30">{rule.matchType}</Badge>
            {rule.invert && <Badge variant="outline" className="text-[10px] border-orange-500/30 bg-orange-500/10 text-orange-400">NOT</Badge>}
          </div>
          <p className="text-xs text-muted-foreground truncate">
            {rule.matchValue} → {outboundLabels[rule.outbound]}
            {rule.outboundNode && `: ${rule.outboundNode}`}
            {rule.downloadDetour && <span className="text-muted-foreground/50"> (via {rule.downloadDetour})</span>}
          </p>
        </div>
        <Switch checked={rule.enabled} disabled={!!busy} onCheckedChange={async () => {
          setBusy("toggle"); try { await onToggle(); } finally { setBusy(null); }
        }} />
        <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-white/[0.04] transition-all duration-200" disabled={!!busy} onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-red-500/10 transition-all duration-200" disabled={!!busy} onClick={async () => {
          setBusy("delete"); try { await onDelete(); } finally { setBusy(null); }
        }}>
          {busy === "delete" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        </Button>
      </CardContent>
    </Card>
  );
}

type RuleFormData = Omit<RouteRule, "id" | "order">;

const defaultForm: RuleFormData = {
  name: "",
  enabled: true,
  matchType: "domain-suffix",
  matchValue: "",
  invert: false,
  outbound: "proxy",
  outboundNode: "",
  ruleSetUrl: "",
  ruleSetLocalPath: "",
  downloadDetour: "direct",
};

export function RulesPage() {
  const { t } = useTranslation();
  const { rules, fetchRules, addRule, updateRule, deleteRule, reorderRules, finalOutbound, fetchFinalOutbound, updateFinalOutbound } = useRulesStore();
  const { groups, fetchGroups } = useNodesStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<RuleFormData>(defaultForm);

  useEffect(() => {
    fetchRules();
    fetchFinalOutbound();
    fetchGroups();
  }, [fetchRules, fetchFinalOutbound, fetchGroups]);

  const allNodes = groups.flatMap((g) => g.nodes);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const ids = rules.map((r) => r.id);
      const oldIndex = ids.indexOf(active.id as string);
      const newIndex = ids.indexOf(over.id as string);
      const newIds = [...ids];
      newIds.splice(oldIndex, 1);
      newIds.splice(newIndex, 0, active.id as string);
      reorderRules(newIds);
    }
  }

  function openAdd() {
    setEditingId(null);
    setForm(defaultForm);
    setDialogOpen(true);
  }

  function openEdit(rule: RouteRule) {
    setEditingId(rule.id);
    setForm({
      name: rule.name,
      enabled: rule.enabled,
      matchType: rule.matchType,
      matchValue: rule.matchValue,
      invert: rule.invert ?? false,
      outbound: rule.outbound,
      outboundNode: rule.outboundNode,
      ruleSetUrl: rule.ruleSetUrl,
      ruleSetLocalPath: rule.ruleSetLocalPath,
      downloadDetour: rule.downloadDetour ?? "direct",
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const toSave = { ...form };
      // Clean up empty optional strings to undefined
      if (!toSave.outboundNode) toSave.outboundNode = undefined;
      if (!toSave.ruleSetUrl) toSave.ruleSetUrl = undefined;
      if (!toSave.ruleSetLocalPath) toSave.ruleSetLocalPath = undefined;
      if (!toSave.downloadDetour) toSave.downloadDetour = undefined;
      if (editingId) {
        await updateRule(editingId, toSave);
      } else {
        await addRule(toSave);
      }
      setDialogOpen(false);
    } finally {
      setSaving(false);
    }
  }

  const activeCount = rules.filter((r) => r.enabled).length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between animate-slide-up">
        <div>
          <h1 className="text-2xl font-semibold">{t("rules.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("rules.rulesCount", { count: rules.length })}{" "}
            <span className="inline-flex items-center justify-center rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">
              {t("rules.activeCount", { count: activeCount })}
            </span>
          </p>
        </div>
        <Button onClick={openAdd} className="shadow-[0_0_15px_rgba(254,151,185,0.15)] transition-all duration-200 hover:shadow-[0_0_25px_rgba(254,151,185,0.25)]">
          <Plus className="mr-2 h-4 w-4" /> {t("rules.addRule")}
        </Button>
      </div>

      <Card className="rounded-xl border border-white/[0.06] bg-card/40 backdrop-blur-xl animate-slide-up">
        <CardContent className="flex items-center gap-4 p-4">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">{t("rules.finalOutbound")}</p>
            <p className="text-xs text-muted-foreground">{t("rules.finalDescription")}</p>
          </div>
          <Select
            value={finalOutbound.outbound === "proxy" && finalOutbound.outboundNode
              ? `node:${finalOutbound.outboundNode}`
              : finalOutbound.outbound}
            onValueChange={(v) => {
              if (v === "direct" || v === "reject") {
                updateFinalOutbound(v);
              } else if (v.startsWith("node:")) {
                updateFinalOutbound("proxy", v.slice(5));
              } else {
                updateFinalOutbound("proxy");
              }
            }}
          >
            <SelectTrigger className="w-[180px] bg-muted/30 border-white/[0.06]"><SelectValue /></SelectTrigger>
            <SelectContent className="border-white/[0.06] bg-card/90 backdrop-blur-2xl">
              <SelectItem value="proxy">{t("common.outbound.proxy")}</SelectItem>
              <SelectItem value="direct">{t("common.outbound.direct")}</SelectItem>
              <SelectItem value="reject">{t("common.outbound.reject")}</SelectItem>
              {allNodes.map((node) => (
                <SelectItem key={node.id} value={`node:${node.name}`}>{node.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={rules.map((r) => r.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {rules.map((rule, i) => (
              <SortableRule
                key={rule.id}
                rule={rule}
                index={i}
                onToggle={() => updateRule(rule.id, { enabled: !rule.enabled })}
                onEdit={() => openEdit(rule)}
                onDelete={() => deleteRule(rule.id)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="rounded-xl border border-white/[0.06] bg-card/80 backdrop-blur-2xl shadow-[0_0_40px_rgba(0,0,0,0.3)]">
          <DialogHeader>
            <DialogTitle>{editingId ? t("rules.editRule") : t("rules.addRule")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input placeholder={t("rules.ruleName")} className="bg-muted/30 border-white/[0.06]" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Select value={form.matchType} onValueChange={(v) => setForm({ ...form, matchType: v as RouteRule["matchType"] })}>
              <SelectTrigger className="bg-muted/30 border-white/[0.06]"><SelectValue /></SelectTrigger>
              <SelectContent className="border-white/[0.06] bg-card/90 backdrop-blur-2xl">
                <SelectItem value="domain-suffix">domain-suffix</SelectItem>
                <SelectItem value="domain-keyword">domain-keyword</SelectItem>
                <SelectItem value="domain-full">domain-full</SelectItem>
                <SelectItem value="domain-regex">domain-regex</SelectItem>
                <SelectItem value="geosite">geosite</SelectItem>
                <SelectItem value="geoip">geoip</SelectItem>
                <SelectItem value="ip-cidr">ip-cidr</SelectItem>
                <SelectItem value="process-name">process-name</SelectItem>
                <SelectItem value="process-path">process-path</SelectItem>
                <SelectItem value="process-path-regex">process-path-regex</SelectItem>
                <SelectItem value="port">port</SelectItem>
                <SelectItem value="port-range">port-range</SelectItem>
                <SelectItem value="network">network (tcp/udp)</SelectItem>
                <SelectItem value="rule-set">rule-set</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Input
                placeholder={
                  form.matchType === "process-name" ? "e.g. Chrome, qbittorrent" :
                  form.matchType === "process-path" ? "e.g. /Applications/Safari.app/Contents/MacOS/Safari" :
                  form.matchType === "process-path-regex" ? "e.g. ^/Applications/.+" :
                  form.matchType === "port" ? "e.g. 80, 443" :
                  form.matchType === "port-range" ? "e.g. 1000:2000" :
                  form.matchType === "network" ? "tcp or udp" :
                  form.matchType === "domain-regex" ? "e.g. ^stun\\..+" :
                  form.matchType === "geosite" ? "e.g. cn, geolocation-!cn, google, netflix" :
                  form.matchType === "geoip" ? "e.g. cn, us, jp" :
                  "Match value"
                }
                className="flex-1 bg-muted/30 border-white/[0.06]"
                value={form.matchValue}
                onChange={(e) => setForm({ ...form, matchValue: e.target.value })}
              />
              <div className="flex items-center gap-1.5 shrink-0">
                <Switch checked={form.invert ?? false} onCheckedChange={(v) => setForm({ ...form, invert: v })} />
                <span className="text-xs text-muted-foreground">{t("rules.invert")}</span>
              </div>
            </div>
            <Select value={form.outbound} onValueChange={(v) => setForm({ ...form, outbound: v as OutboundType })}>
              <SelectTrigger className="bg-muted/30 border-white/[0.06]"><SelectValue /></SelectTrigger>
              <SelectContent className="border-white/[0.06] bg-card/90 backdrop-blur-2xl">
                <SelectItem value="proxy">Proxy</SelectItem>
                <SelectItem value="direct">DIRECT</SelectItem>
                <SelectItem value="reject">REJECT</SelectItem>
                <SelectItem value="tailnet">Tailnet</SelectItem>
              </SelectContent>
            </Select>
            {form.outbound === "proxy" && (
              <Select value={form.outboundNode || undefined} onValueChange={(v) => setForm({ ...form, outboundNode: v })}>
                <SelectTrigger className="bg-muted/30 border-white/[0.06]"><SelectValue placeholder={t("rules.selectNode")} /></SelectTrigger>
                <SelectContent className="border-white/[0.06] bg-card/90 backdrop-blur-2xl">
                  {allNodes.map((node) => (
                    <SelectItem key={node.id} value={node.name}>{node.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {(form.matchType === "geosite" || form.matchType === "geoip") && (
              <div className="space-y-2 rounded-lg border border-white/[0.04] bg-muted/10 p-3">
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider">{t("rules.ruleSetDownload")}</label>
                <Input
                  placeholder={t("rules.localRuleSetPath")}
                  className="bg-muted/30 border-white/[0.06] text-xs font-mono"
                  value={form.ruleSetLocalPath ?? ""}
                  onChange={(e) => setForm({ ...form, ruleSetLocalPath: e.target.value })}
                />
                <Input
                  placeholder={t("rules.remoteRuleSetUrl")}
                  className="bg-muted/30 border-white/[0.06] text-xs font-mono"
                  value={form.ruleSetUrl ?? ""}
                  onChange={(e) => setForm({ ...form, ruleSetUrl: e.target.value })}
                />
                <Select value={form.downloadDetour ?? "direct"} onValueChange={(v) => setForm({ ...form, downloadDetour: v })}>
                  <SelectTrigger className="bg-muted/30 border-white/[0.06]"><SelectValue placeholder={t("rules.downloadVia")} /></SelectTrigger>
                  <SelectContent className="border-white/[0.06] bg-card/90 backdrop-blur-2xl">
                    <SelectItem value="direct">DIRECT</SelectItem>
                    <SelectItem value="proxy">Proxy</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-white/[0.06] hover:bg-white/[0.04]" onClick={() => setDialogOpen(false)} disabled={saving}>{t("common.actions.cancel")}</Button>
            <Button onClick={handleSave} disabled={saving} className="shadow-[0_0_15px_rgba(254,151,185,0.15)]">{saving ? t("rules.saving") : t("common.actions.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
