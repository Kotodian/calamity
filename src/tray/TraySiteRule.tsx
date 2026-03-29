import { useState, useEffect } from "react";
import { Globe, Plus, Check, Loader2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { OutboundType } from "@/services/types";
import { useRulesStore } from "@/stores/rules";
import { cn } from "@/lib/utils";

const outboundOptions: { value: OutboundType; label: string }[] = [
  { value: "proxy", label: "Proxy" },
  { value: "direct", label: "Direct" },
  { value: "reject", label: "Reject" },
];

function extractDomain(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function TraySiteRule() {
  const [domain, setDomain] = useState("");
  const [detecting, setDetecting] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [dialogDomain, setDialogDomain] = useState("");
  const [dialogOutbound, setDialogOutbound] = useState<OutboundType>("proxy");
  const [added, setAdded] = useState(false);
  const [adding, setAdding] = useState(false);
  const addRule = useRulesStore((s) => s.addRule);

  useEffect(() => {
    (async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const url = await invoke<string | null>("get_browser_url");
        if (url) {
          setDomain(extractDomain(url));
        }
      } catch {
        // Not in Tauri or detection failed
      } finally {
        setDetecting(false);
      }
    })();
  }, []);

  const openDialog = () => {
    setDialogDomain(domain);
    setDialogOutbound("proxy");
    setAdded(false);
    setShowDialog(true);
  };

  const handleConfirm = async () => {
    if (!dialogDomain || adding) return;
    setAdding(true);
    try {
      await addRule({
        name: dialogDomain,
        enabled: true,
        matchType: "domain-suffix",
        matchValue: dialogDomain,
        outbound: dialogOutbound,
      });
      setAdded(true);
      setTimeout(() => {
        setShowDialog(false);
        setAdded(false);
      }, 1000);
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
        Current Site
      </p>
      <div
        onClick={domain ? openDialog : undefined}
        className={cn(
          "flex items-center gap-2 rounded-md px-1 py-1.5 transition-colors",
          domain ? "cursor-pointer hover:bg-accent" : ""
        )}
      >
        <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        {detecting ? (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        ) : domain ? (
          <span className="text-xs font-mono truncate flex-1">{domain}</span>
        ) : (
          <span className="text-xs text-muted-foreground/50">No site detected</span>
        )}
        {domain && !showDialog && (
          <Plus className="h-3 w-3 text-muted-foreground shrink-0" />
        )}
      </div>

      {/* Rule Dialog */}
      {showDialog && (
        <div className="rounded-lg border border-white/[0.08] bg-muted/40 p-3 space-y-3 animate-in fade-in slide-in-from-top-1 duration-150">
          {/* Header */}
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              Add Rule
            </p>
            <button
              onClick={() => setShowDialog(false)}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-3 w-3" />
            </button>
          </div>

          {/* Match Type */}
          <div className="space-y-1">
            <p className="text-[10px] text-muted-foreground">Type</p>
            <Badge variant="outline" className="text-[10px] border-white/[0.06]">
              domain-suffix
            </Badge>
          </div>

          {/* Domain Value */}
          <div className="space-y-1">
            <p className="text-[10px] text-muted-foreground">Value</p>
            <Input
              value={dialogDomain}
              onChange={(e) => setDialogDomain(e.target.value)}
              placeholder="example.com"
              className="h-7 text-xs font-mono bg-background/50 border-white/[0.06] px-2"
            />
          </div>

          {/* Outbound */}
          <div className="space-y-1">
            <p className="text-[10px] text-muted-foreground">Outbound</p>
            <div className="flex gap-1">
              {outboundOptions.map((opt) => (
                <Badge
                  key={opt.value}
                  variant={dialogOutbound === opt.value ? "default" : "outline"}
                  className={cn("cursor-pointer text-[10px]")}
                  onClick={() => setDialogOutbound(opt.value)}
                >
                  {opt.label}
                </Badge>
              ))}
            </div>
          </div>

          {/* Confirm */}
          <Button
            size="sm"
            className={cn(
              "w-full h-7 text-xs",
              added && "bg-green-600 hover:bg-green-600"
            )}
            onClick={handleConfirm}
            disabled={!dialogDomain || adding}
          >
            {added ? (
              <><Check className="mr-1 h-3 w-3" /> Added</>
            ) : adding ? (
              <><Loader2 className="mr-1 h-3 w-3 animate-spin" /> Adding...</>
            ) : (
              <><Plus className="mr-1 h-3 w-3" /> Confirm</>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
