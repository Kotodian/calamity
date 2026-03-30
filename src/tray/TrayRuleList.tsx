import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ExternalLink } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRulesStore } from "@/stores/rules";
import { useNodesStore } from "@/stores/nodes";
import type { OutboundType } from "@/services/types";

const MAX_VISIBLE_RULES = 10;

function outboundDisplayValue(
  outbound: OutboundType,
  outboundNode: string | undefined,
  groups: { id: string; name: string }[]
): string {
  if (outbound === "direct") return "direct";
  if (outbound === "reject") return "reject";
  // proxy outbound: match to a group, or fall back to first group
  if (outboundNode) {
    const group = groups.find((g) => g.name === outboundNode);
    if (group) return `group:${group.id}`;
  }
  // Default proxy → first group
  if (groups.length > 0) return `group:${groups[0].id}`;
  return "direct";
}

export function TrayRuleList() {
  const { t } = useTranslation();
  const { rules, fetchRules, updateRule } = useRulesStore();
  const { groups, fetchGroups } = useNodesStore();

  useEffect(() => {
    fetchRules();
    fetchGroups();
  }, [fetchRules, fetchGroups]);

  const enabledRules = rules.filter((r) => r.enabled).slice(0, MAX_VISIBLE_RULES);
  const totalEnabled = rules.filter((r) => r.enabled).length;

  const handleOutboundChange = async (ruleId: string, value: string) => {
    if (value === "direct" || value === "reject") {
      await updateRule(ruleId, { outbound: value as OutboundType, outboundNode: undefined });
    } else if (value.startsWith("group:")) {
      const groupId = value.slice(6);
      const group = groups.find((g) => g.id === groupId);
      if (group) {
        await updateRule(ruleId, { outbound: "proxy", outboundNode: group.name });
      }
    }
  };

  const openDashboardRules = async () => {
    try {
      const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
      const main = await WebviewWindow.getByLabel("main");
      if (main) {
        await main.show();
        await main.unminimize();
        await main.setFocus();
      }
    } catch (e) {
      console.error("Failed to open dashboard:", e);
    }
  };

  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
        {t("tray.rules")}
      </p>
      {enabledRules.length === 0 ? (
        <p className="text-xs text-muted-foreground/50 py-1">{t("tray.noRules")}</p>
      ) : (
        <div className="space-y-1 max-h-[240px] overflow-y-auto">
          {enabledRules.map((rule) => (
            <div key={rule.id} className="flex items-center gap-1.5">
              <span className="text-[11px] truncate flex-1 min-w-0" title={rule.name}>
                {rule.name}
              </span>
              <Select
                value={outboundDisplayValue(rule.outbound, rule.outboundNode, groups)}
                onValueChange={(v) => handleOutboundChange(rule.id, v)}
              >
                <SelectTrigger className="h-6 w-[90px] shrink-0 bg-transparent text-[10px] border-white/[0.06] px-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {groups.map((g) => (
                    <SelectItem key={g.id} value={`group:${g.id}`}>
                      [{t("tray.group")}] {g.name}
                    </SelectItem>
                  ))}
                  <SelectItem value="direct">{t("common.outbound.direct")}</SelectItem>
                  <SelectItem value="reject">{t("common.outbound.reject")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      )}
      {totalEnabled > MAX_VISIBLE_RULES && (
        <button
          onClick={openDashboardRules}
          className="flex w-full items-center justify-center gap-1 rounded-md py-1 text-[10px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <ExternalLink className="h-3 w-3" />
          {t("tray.viewAll")}
        </button>
      )}
    </div>
  );
}
