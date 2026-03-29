import { useConnectionStore } from "@/stores/connection";
import type { ProxyMode } from "@/services/types";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

export function TrayModeSwitch() {
  const { t } = useTranslation();
  const { mode, setMode } = useConnectionStore();
  const modes: { value: ProxyMode; label: string }[] = [
    { value: "rule", label: t("common.modes.rule") },
    { value: "global", label: t("common.modes.global") },
    { value: "direct", label: t("common.modes.direct") },
  ];

  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
        {t("tray.proxyMode")}
      </p>
      <div className="flex gap-1 rounded-lg bg-muted p-0.5">
        {modes.map((m) => (
          <button
            key={m.value}
            onClick={() => setMode(m.value)}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              mode === m.value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {m.label}
          </button>
        ))}
      </div>
    </div>
  );
}
