import { useState } from "react";
import { Plus, Filter, Globe, ArrowRight, ClipboardPaste } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useRulesStore } from "@/stores/rules";
import { useDnsStore } from "@/stores/dns";
import { useNodesStore } from "@/stores/nodes";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { parseMultipleUris } from "@/lib/proxy-uri";
import { countryFlag } from "@/lib/flags";
import type { RouteRule } from "@/services/types";

const matchTypes: RouteRule["matchType"][] = [
  "domain-suffix", "domain-keyword", "domain-full", "domain-regex",
  "geosite", "geoip", "ip-cidr", "process-name", "rule-set",
];

export function NodeAddPanel() {
  const { t } = useTranslation();
  const addRule = useRulesStore((s) => s.addRule);
  const addDnsServer = useDnsStore((s) => s.addServer);
  const groups = useNodesStore((s) => s.groups);
  const addNode = useNodesStore((s) => s.addNode);

  const [matchOpen, setMatchOpen] = useState(false);
  const [dnsOpen, setDnsOpen] = useState(false);
  const [proxyOpen, setProxyOpen] = useState(false);

  const [matchType, setMatchType] = useState<RouteRule["matchType"]>("domain-suffix");
  const [matchValue, setMatchValue] = useState("");

  const [dnsName, setDnsName] = useState("");
  const [dnsAddress, setDnsAddress] = useState("");

  const [proxyUri, setProxyUri] = useState("");

  const allProxyNodes = groups.flatMap((g) => g.nodes);
  const [searchQuery, setSearchQuery] = useState("");
  const filteredNodes = allProxyNodes.filter((n) =>
    n.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  async function handleAddMatch() {
    if (!matchValue.trim()) return;
    await addRule({
      name: `${matchType}: ${matchValue}`,
      enabled: true,
      matchType,
      matchValue: matchValue.trim(),
      outbound: "direct",
    });
    setMatchValue("");
    setMatchOpen(false);
  }

  async function handleAddDns() {
    if (!dnsName.trim() || !dnsAddress.trim()) return;
    await addDnsServer({ name: dnsName.trim(), address: dnsAddress.trim(), enabled: true });
    setDnsName("");
    setDnsAddress("");
    setDnsOpen(false);
  }

  async function handleAddProxy() {
    const uriText = proxyUri.trim();
    if (!uriText) return;
    const parsed = parseMultipleUris(uriText);
    if (parsed.length === 0) {
      toast.error(t("flow.invalidUri"));
      return;
    }
    const groupId = groups[0]?.id;
    if (!groupId) {
      toast.error(t("flow.noGroup"));
      return;
    }
    for (const node of parsed) {
      await addNode(groupId, node);
    }
    toast.success(t("flow.nodesAdded", { count: parsed.length }));
    setProxyUri("");
    setProxyOpen(false);
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" className="text-xs gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            {t("flow.addNode")}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => setMatchOpen(true)}>
            <Filter className="h-3.5 w-3.5 mr-2 text-pink-400" />
            {t("flow.addMatch")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setDnsOpen(true)}>
            <Globe className="h-3.5 w-3.5 mr-2 text-blue-400" />
            {t("flow.addDns")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setProxyOpen(true)}>
            <ArrowRight className="h-3.5 w-3.5 mr-2 text-green-400" />
            {t("flow.addOutbound")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={matchOpen} onOpenChange={setMatchOpen}>
        <DialogContent className="bg-card/95 backdrop-blur-2xl border-white/[0.06]">
          <DialogHeader>
            <DialogTitle className="text-sm">{t("flow.addMatch")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Select value={matchType} onValueChange={(v) => setMatchType(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {matchTypes.map((mt) => (
                  <SelectItem key={mt} value={mt}>{mt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="e.g. google.com"
              value={matchValue}
              onChange={(e) => setMatchValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddMatch()}
            />
          </div>
          <DialogFooter>
            <Button size="sm" onClick={handleAddMatch}>{t("common.add")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dnsOpen} onOpenChange={setDnsOpen}>
        <DialogContent className="bg-card/95 backdrop-blur-2xl border-white/[0.06]">
          <DialogHeader>
            <DialogTitle className="text-sm">{t("flow.addDns")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Name (e.g. Cloudflare)"
              value={dnsName}
              onChange={(e) => setDnsName(e.target.value)}
            />
            <Input
              placeholder="Address (e.g. https://1.1.1.1/dns-query)"
              value={dnsAddress}
              onChange={(e) => setDnsAddress(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddDns()}
            />
          </div>
          <DialogFooter>
            <Button size="sm" onClick={handleAddDns}>{t("common.add")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={proxyOpen} onOpenChange={setProxyOpen}>
        <DialogContent className="bg-card/95 backdrop-blur-2xl border-white/[0.06]">
          <DialogHeader>
            <DialogTitle className="text-sm">{t("flow.addOutbound")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              className="text-xs"
              placeholder={t("flow.searchNode")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <div className="max-h-32 overflow-y-auto space-y-1">
              {filteredNodes.slice(0, 20).map((n) => (
                <button
                  key={n.id}
                  className="w-full text-left text-xs px-2 py-1.5 rounded-lg hover:bg-muted/30 flex items-center gap-2"
                  onClick={() => {
                    addRule({
                      name: `→ ${n.name}`,
                      enabled: true,
                      matchType: "domain-suffix",
                      matchValue: "",
                      outbound: "proxy",
                      outboundNode: n.name,
                    });
                    setProxyOpen(false);
                  }}
                >
                  <span>{countryFlag(n.countryCode)}</span>
                  <span className="truncate">{n.name}</span>
                  <span className="text-muted-foreground ml-auto">{n.protocol}</span>
                </button>
              ))}
            </div>
            <div className="border-t border-white/[0.06] pt-2" />
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ClipboardPaste className="h-3.5 w-3.5" />
              {t("flow.pasteUri")}
            </div>
            <textarea
              className="w-full h-24 rounded-lg border border-white/[0.06] bg-muted/20 px-3 py-2 text-xs font-mono resize-none focus:outline-none focus:border-white/20"
              placeholder="vless://... or vmess://... (one per line)"
              value={proxyUri}
              onChange={(e) => setProxyUri(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button size="sm" onClick={handleAddProxy}>{t("common.add")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
