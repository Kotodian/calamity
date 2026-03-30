import { useTranslation } from "react-i18next";
import { Switch } from "@/components/ui/switch";
import { useSettingsStore } from "@/stores/settings";

export function TrayEnhancedMode() {
  const { t } = useTranslation();
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  if (!settings) return null;

  return (
    <div className="flex items-center justify-between py-0.5">
      <p className="text-[11px] font-medium">{t("tray.enhancedMode")}</p>
      <Switch
        className="scale-75"
        checked={settings.enhancedMode}
        onCheckedChange={(v) => updateSettings({ enhancedMode: v })}
      />
    </div>
  );
}
