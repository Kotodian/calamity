import { Shield, Copy, ExternalLink, Power } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useSettingsStore } from "@/stores/settings";
import { useConnectionStore } from "@/stores/connection";

export function TrayActions() {
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const status = useConnectionStore((s) => s.status);
  const toggleConnection = useConnectionStore((s) => s.toggleConnection);
  const isConnected = status === "connected";

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
      <button
        onClick={() => {
          const port = settings?.mixedPort ?? 7893;
          navigator.clipboard?.writeText(`127.0.0.1:${port}`);
        }}
        className="flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
      >
        <Copy className="h-3.5 w-3.5" />
        Copy Proxy Address
      </button>
      <button
        onClick={async () => {
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
        }}
        className="flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
      >
        <ExternalLink className="h-3.5 w-3.5" />
        Open Dashboard
      </button>
      <button
        onClick={toggleConnection}
        className={`flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-xs transition-colors ${
          isConnected
            ? "text-destructive hover:bg-destructive/10"
            : "text-green-600 hover:bg-green-500/10"
        }`}
      >
        <Power className="h-3.5 w-3.5" />
        {isConnected ? "Disconnect" : "Connect"}
      </button>
    </div>
  );
}
