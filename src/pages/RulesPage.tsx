import { useEffect, useState } from "react";
import { GripVertical, Plus, Trash2, Pencil } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
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
import type { OutboundType, RouteRule } from "@/services/types";
import { cn } from "@/lib/utils";

const outboundColors: Record<OutboundType, string> = {
  proxy: "border-l-primary",
  direct: "border-l-green-500",
  reject: "border-l-red-500",
  tailnet: "border-l-teal-500",
};

const outboundLabels: Record<OutboundType, string> = {
  proxy: "Proxy",
  direct: "DIRECT",
  reject: "REJECT",
  tailnet: "Tailnet",
};

function SortableRule({
  rule,
  onToggle,
  onEdit,
  onDelete,
}: {
  rule: RouteRule;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: rule.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={cn("border-l-4", outboundColors[rule.outbound], !rule.enabled && "opacity-50")}
    >
      <CardContent className="flex items-center gap-3 p-3">
        <button {...attributes} {...listeners} className="cursor-grab text-muted-foreground hover:text-foreground">
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{rule.name}</span>
            <Badge variant="outline" className="text-[10px]">{rule.matchType}</Badge>
          </div>
          <p className="text-xs text-muted-foreground truncate">
            {rule.matchValue} → {outboundLabels[rule.outbound]}
            {rule.outboundNode && `: ${rule.outboundNode}`}
            {rule.outboundDevice && `: ${rule.outboundDevice}`}
          </p>
        </div>
        <Switch checked={rule.enabled} onCheckedChange={onToggle} />
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5" />
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
  outbound: "proxy",
  outboundNode: "",
  outboundDevice: "",
};

export function RulesPage() {
  const { rules, fetchRules, addRule, updateRule, deleteRule, reorderRules } = useRulesStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<RuleFormData>(defaultForm);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

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
      outbound: rule.outbound,
      outboundNode: rule.outboundNode,
      outboundDevice: rule.outboundDevice,
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (editingId) {
      await updateRule(editingId, form);
    } else {
      await addRule(form);
    }
    setDialogOpen(false);
  }

  const activeCount = rules.filter((r) => r.enabled).length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Rules</h1>
          <p className="text-sm text-muted-foreground">{rules.length} rules • {activeCount} active</p>
        </div>
        <Button onClick={openAdd}>
          <Plus className="mr-2 h-4 w-4" /> Add Rule
        </Button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={rules.map((r) => r.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {rules.map((rule) => (
              <SortableRule
                key={rule.id}
                rule={rule}
                onToggle={() => updateRule(rule.id, { enabled: !rule.enabled })}
                onEdit={() => openEdit(rule)}
                onDelete={() => deleteRule(rule.id)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Rule" : "Add Rule"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input placeholder="Rule name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Select value={form.matchType} onValueChange={(v) => setForm({ ...form, matchType: v as RouteRule["matchType"] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="domain-suffix">domain-suffix</SelectItem>
                <SelectItem value="domain-keyword">domain-keyword</SelectItem>
                <SelectItem value="domain-full">domain-full</SelectItem>
                <SelectItem value="geosite">geosite</SelectItem>
                <SelectItem value="geoip">geoip</SelectItem>
                <SelectItem value="ip-cidr">ip-cidr</SelectItem>
              </SelectContent>
            </Select>
            <Input placeholder="Match value" value={form.matchValue} onChange={(e) => setForm({ ...form, matchValue: e.target.value })} />
            <Select value={form.outbound} onValueChange={(v) => setForm({ ...form, outbound: v as OutboundType })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="proxy">Proxy</SelectItem>
                <SelectItem value="direct">DIRECT</SelectItem>
                <SelectItem value="reject">REJECT</SelectItem>
                <SelectItem value="tailnet">Tailnet</SelectItem>
              </SelectContent>
            </Select>
            {form.outbound === "proxy" && (
              <Input placeholder="Node name (e.g. Tokyo 01)" value={form.outboundNode ?? ""} onChange={(e) => setForm({ ...form, outboundNode: e.target.value })} />
            )}
            {form.outbound === "tailnet" && (
              <Input placeholder="Tailnet device name" value={form.outboundDevice ?? ""} onChange={(e) => setForm({ ...form, outboundDevice: e.target.value })} />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
