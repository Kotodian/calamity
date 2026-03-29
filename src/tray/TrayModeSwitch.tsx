import { useConnectionStore } from "@/stores/connection";
import type { ProxyMode } from "@/services/types";
import { cn } from "@/lib/utils";

const modes: { value: ProxyMode; label: string }[] = [
  { value: "rule", label: "Rule" },
  { value: "global", label: "Global" },
  { value: "direct", label: "Direct" },
];

export function TrayModeSwitch() {
  const { mode, setMode } = useConnectionStore();

  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
        Proxy Mode
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
