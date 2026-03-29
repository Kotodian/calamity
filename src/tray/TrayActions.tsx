import { Shield, Copy, ExternalLink, Power } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useSettingsStore } from "@/stores/settings";
import { useConnectionStore } from "@/stores/connection";

export function TrayActions() {
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const toggleConnection = useConnectionStore((s) => s.toggleConnection);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between py-1">
        <div className="flex items-center gap-2 text-xs">
          <Shield className="h-3.5 w-3.5" />
          <span>System Proxy</span>
        </div>
        <Switch
          className="scale-75"
          checked={settings?.systemProxy ?? false}
          onCheckedChange={(v) => updateSettings({ systemProxy: v })}
        />
      </div>
      <button className="flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
        <Copy className="h-3.5 w-3.5" />
        Copy Proxy Address
      </button>
      <button className="flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
        <ExternalLink className="h-3.5 w-3.5" />
        Open Dashboard
      </button>
      <button
        onClick={toggleConnection}
        className="flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-xs text-destructive hover:bg-destructive/10 transition-colors"
      >
        <Power className="h-3.5 w-3.5" />
        Disconnect
      </button>
    </div>
  );
}
