import { useState } from "react";
import { ClipboardPaste, Loader2, Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useNodesStore } from "@/stores/nodes";
import { parseMultipleUris } from "@/lib/proxy-uri";

export function TrayImportNode() {
  const { t } = useTranslation();
  const { groups, addNode, fetchGroups } = useNodesStore();
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(false);

  const handlePaste = async () => {
    if (importing) return;
    setImporting(true);
    setDone(false);
    try {
      const text = await navigator.clipboard.readText();
      const nodes = parseMultipleUris(text);
      if (nodes.length === 0) {
        toast.error(t("tray.importNoNodes"));
        setImporting(false);
        return;
      }
      const targetGroup = groups[0]?.id ?? "proxy";
      let added = 0;
      for (const { name, ...rest } of nodes) {
        try {
          await addNode(targetGroup, { name, ...rest });
          added++;
        } catch {
          // skip duplicates
        }
      }
      await fetchGroups();
      if (added > 0) {
        toast.success(t("tray.importedNodes", { count: added }));
        setDone(true);
        setTimeout(() => setDone(false), 2000);
      } else {
        toast.error(t("tray.importAllDuplicate"));
      }
    } catch {
      toast.error(t("tray.importFailed"));
    } finally {
      setImporting(false);
    }
  };

  return (
    <button
      onClick={handlePaste}
      disabled={importing}
      className="flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
    >
      {importing ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : done ? (
        <Check className="h-3.5 w-3.5 text-green-500" />
      ) : (
        <ClipboardPaste className="h-3.5 w-3.5" />
      )}
      {importing ? t("tray.importing") : t("tray.importNode")}
    </button>
  );
}
