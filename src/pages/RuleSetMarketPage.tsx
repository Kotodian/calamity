import { useEffect, useState } from "react";
import { Search, Plus, Loader2, Download } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { useTranslation } from "react-i18next";
import { useRuleSetMarketStore } from "@/stores/ruleset-market";
import { useRulesStore } from "@/stores/rules";
import { useNodesStore } from "@/stores/nodes";
import type { OutboundType } from "@/services/types";
import { toast } from "sonner";

export function RuleSetMarketPage() {
  const { t } = useTranslation();
  const { entries, loading, error, search, setSearch, fetchList, filtered } =
    useRuleSetMarketStore();
  const { addRule } = useRulesStore();
  const { groups, fetchGroups } = useNodesStore();
  const allNodes = groups.flatMap((g) => g.nodes);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<{ name: string; url: string } | null>(null);
  const [outbound, setOutbound] = useState<OutboundType>("proxy");
  const [outboundNode, setOutboundNode] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    fetchList();
    fetchGroups();
  }, [fetchList, fetchGroups]);

  function openAddDialog(entry: { name: string; url: string }) {
    setSelectedEntry(entry);
    setOutbound("proxy");
    setOutboundNode("");
    setDialogOpen(true);
  }

  async function handleAdd() {
    if (!selectedEntry) return;
    setAdding(true);
    try {
      await addRule({
        name: selectedEntry.name,
        enabled: true,
        matchType: "rule-set",
        matchValue: selectedEntry.name,
        outbound,
        outboundNode: outbound === "proxy" && outboundNode ? outboundNode : undefined,
        ruleSetUrl: selectedEntry.url,
        downloadDetour: "direct",
      });
      toast.success(t("ruleSetMarket.added", { name: selectedEntry.name }));
      setDialogOpen(false);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setAdding(false);
    }
  }

  const list = filtered();

  return (
    <div className="p-6 space-y-6">
      <div className="animate-slide-up">
        <h1 className="text-2xl font-semibold">{t("ruleSetMarket.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("ruleSetMarket.subtitle", { count: entries.length })}
        </p>
      </div>

      <div className="relative animate-slide-up">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={t("ruleSetMarket.searchPlaceholder")}
          className="pl-9 bg-muted/30 border-white/[0.06]"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {error && (
        <div className="text-sm text-red-400 text-center py-4">{error}</div>
      )}

      {!loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {list.map((entry) => (
            <Card
              key={entry.name}
              className="rounded-xl border border-white/[0.06] bg-card/40 backdrop-blur-xl transition-all duration-200 hover:border-white/10 hover:bg-card/80"
            >
              <CardContent className="flex items-center justify-between p-3">
                <span className="text-sm font-medium truncate">{entry.name}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 hover:bg-white/[0.04]"
                  onClick={() => openAddDialog(entry)}
                >
                  <Download className="h-3.5 w-3.5" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!loading && !error && list.length === 0 && search && (
        <p className="text-sm text-muted-foreground text-center py-8">
          {t("ruleSetMarket.noResults")}
        </p>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="rounded-xl border border-white/[0.06] bg-card/80 backdrop-blur-2xl shadow-[0_0_40px_rgba(0,0,0,0.3)]">
          <DialogHeader>
            <DialogTitle>
              {t("ruleSetMarket.addTitle", { name: selectedEntry?.name })}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Select value={outbound} onValueChange={(v) => setOutbound(v as OutboundType)}>
              <SelectTrigger className="bg-muted/30 border-white/[0.06]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-white/[0.06] bg-card/90 backdrop-blur-2xl">
                <SelectItem value="proxy">{t("common.outbound.proxy")}</SelectItem>
                <SelectItem value="direct">{t("common.outbound.direct")}</SelectItem>
                <SelectItem value="reject">{t("common.outbound.reject")}</SelectItem>
                <SelectItem value="tailnet">{t("common.outbound.tailnet")}</SelectItem>
              </SelectContent>
            </Select>
            {outbound === "proxy" && (
              <Select value={outboundNode || undefined} onValueChange={setOutboundNode}>
                <SelectTrigger className="bg-muted/30 border-white/[0.06]">
                  <SelectValue placeholder={t("rules.selectNode")} />
                </SelectTrigger>
                <SelectContent className="border-white/[0.06] bg-card/90 backdrop-blur-2xl">
                  {allNodes.map((node) => (
                    <SelectItem key={node.id} value={node.name}>
                      {node.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="border-white/[0.06] hover:bg-white/[0.04]"
              onClick={() => setDialogOpen(false)}
              disabled={adding}
            >
              {t("common.actions.cancel")}
            </Button>
            <Button
              onClick={handleAdd}
              disabled={adding}
              className="shadow-[0_0_15px_rgba(254,151,185,0.15)]"
            >
              {adding ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
              {t("ruleSetMarket.add")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
