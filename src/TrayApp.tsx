import { useEffect } from "react";
import { TrayStatus } from "./tray/TrayStatus";
import { TrayModeSwitch } from "./tray/TrayModeSwitch";
import { TrayEnhancedMode } from "./tray/TrayEnhancedMode";
import { TrayRuleList } from "./tray/TrayRuleList";
import { TraySiteRule } from "./tray/TraySiteRule";
import { TrayActions } from "./tray/TrayActions";
import { Separator } from "@/components/ui/separator";
import { useConnectionStore } from "@/stores/connection";
import { useSettingsStore } from "@/stores/settings";

export function TrayApp() {
  const mode = useConnectionStore((s) => s.mode);
  const fetchState = useConnectionStore((s) => s.fetchState);
  const fetchSettings = useSettingsStore((s) => s.fetchSettings);
  const subscribeTraffic = useConnectionStore((s) => s.subscribeTraffic);
  const fetchDashboardInfo = useConnectionStore((s) => s.fetchDashboardInfo);

  useEffect(() => {
    fetchState();
    fetchSettings();
    fetchDashboardInfo();
    const unsub = subscribeTraffic();
    return unsub;
  }, [fetchState, fetchSettings, subscribeTraffic, fetchDashboardInfo]);

  return (
    <div className="p-2">
      <div className="w-68 rounded-2xl border border-white/20 bg-background/70 p-3 backdrop-blur-2xl shadow-2xl space-y-2">
        <TrayStatus />
        <Separator className="bg-border/50" />
        <TrayModeSwitch />
        <Separator className="bg-border/50" />
        <TrayEnhancedMode />
        {mode === "rule" && (
          <>
            <Separator className="bg-border/50" />
            <TrayRuleList />
          </>
        )}
        <Separator className="bg-border/50" />
        <TraySiteRule />
        <Separator className="bg-border/50" />
        <TrayActions />
      </div>
    </div>
  );
}
