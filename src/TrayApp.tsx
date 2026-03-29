import { useEffect } from "react";
import { TrayStatus } from "./tray/TrayStatus";
import { TrayModeSwitch } from "./tray/TrayModeSwitch";
import { TraySiteRule } from "./tray/TraySiteRule";
import { TrayActions } from "./tray/TrayActions";
import { Separator } from "@/components/ui/separator";
import { useConnectionStore } from "@/stores/connection";
import { useSettingsStore } from "@/stores/settings";

export function TrayApp() {
  const fetchState = useConnectionStore((s) => s.fetchState);
  const fetchSettings = useSettingsStore((s) => s.fetchSettings);

  useEffect(() => {
    fetchState();
    fetchSettings();
  }, [fetchState, fetchSettings]);

  return (
    <div className="w-72 rounded-xl border border-border bg-background/95 p-3 backdrop-blur-xl shadow-lg space-y-2">
      <TrayStatus />
      <Separator />
      <TrayModeSwitch />
      <Separator />
      <TraySiteRule />
      <Separator />
      <TrayActions />
    </div>
  );
}
