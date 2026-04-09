import { useState, useEffect } from "react";
import { X, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useRulesStore } from "@/stores/rules";
import { useDnsStore } from "@/stores/dns";
import { useTranslation } from "react-i18next";
import type { FlowNode, MatchNodeData, DnsNodeData } from "../flow-types";
import type { RouteRule } from "@/services/types";

const matchTypes: RouteRule["matchType"][] = [
  "domain-suffix", "domain-keyword", "domain-full", "domain-regex",
  "geosite", "geoip", "ip-cidr", "process-name", "rule-set",
];

interface Props {
  node: FlowNode | null;
  onClose: () => void;
}

export function NodeEditPanel({ node, onClose }: Props) {
  if (!node) return null;

  if (node.type === "match") return (
    <MatchEditor data={node.data as MatchNodeData} onClose={onClose} />
  );

  if (node.type === "dns") return (
    <DnsEditor data={node.data as DnsNodeData} onClose={onClose} />
  );

  return null;
}

function MatchEditor({ data, onClose }: { data: MatchNodeData; onClose: () => void }) {
  const { t } = useTranslation();
  const updateRule = useRulesStore((s) => s.updateRule);
  const deleteRule = useRulesStore((s) => s.deleteRule);

  const [matchType, setMatchType] = useState(data.matchType);
  const [matchValue, setMatchValue] = useState(data.matchValue);
  const [enabled, setEnabled] = useState(data.enabled);

  useEffect(() => {
    setMatchType(data.matchType);
    setMatchValue(data.matchValue);
    setEnabled(data.enabled);
  }, [data]);

  function handleSave() {
    updateRule(data.ruleId, { matchType, matchValue, enabled });
    onClose();
  }

  return (
    <div className="absolute right-4 top-4 w-72 rounded-xl border border-white/[0.06] bg-card/90 backdrop-blur-2xl p-4 space-y-3 shadow-[0_0_40px_rgba(0,0,0,0.4)] z-50 animate-slide-up">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium">{t("flow.editMatch")}</p>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <Select value={matchType} onValueChange={(v) => setMatchType(v as any)}>
        <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          {matchTypes.map((mt) => (
            <SelectItem key={mt} value={mt}>{mt}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        className="text-xs"
        value={matchValue}
        onChange={(e) => setMatchValue(e.target.value)}
      />
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{t("common.enabled")}</span>
        <Switch checked={enabled} onCheckedChange={setEnabled} />
      </div>
      <div className="flex gap-2">
        <Button size="sm" className="text-xs flex-1" onClick={handleSave}>
          {t("common.save")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-xs text-red-400"
          onClick={() => { deleteRule(data.ruleId); onClose(); }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function DnsEditor({ data, onClose }: { data: DnsNodeData; onClose: () => void }) {
  const { t } = useTranslation();
  const updateServer = useDnsStore((s) => s.updateServer);
  const deleteServer = useDnsStore((s) => s.deleteServer);

  const [name, setName] = useState(data.serverName);
  const [address, setAddress] = useState(data.address);

  useEffect(() => {
    setName(data.serverName);
    setAddress(data.address);
  }, [data]);

  function handleSave() {
    updateServer({ name, address, enabled: data.enabled });
    onClose();
  }

  return (
    <div className="absolute right-4 top-4 w-72 rounded-xl border border-white/[0.06] bg-card/90 backdrop-blur-2xl p-4 space-y-3 shadow-[0_0_40px_rgba(0,0,0,0.4)] z-50 animate-slide-up">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium">{t("flow.editDns")}</p>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <Input
        className="text-xs"
        placeholder="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <Input
        className="text-xs"
        placeholder="Address"
        value={address}
        onChange={(e) => setAddress(e.target.value)}
      />
      <div className="flex gap-2">
        <Button size="sm" className="text-xs flex-1" onClick={handleSave}>
          {t("common.save")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-xs text-red-400"
          onClick={() => { deleteServer(data.serverName); onClose(); }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
