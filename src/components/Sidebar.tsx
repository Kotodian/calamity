import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Globe,
  Route,
  ScrollText,
  Network,
  Shell,
  Settings,
  Cable,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useConnectionStore } from "@/stores/connection";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/nodes", icon: Globe, label: "Nodes" },
  { to: "/rules", icon: Route, label: "Rules" },
  { to: "/connections", icon: Cable, label: "Connections" },
  { to: "/logs", icon: ScrollText, label: "Logs" },
  { to: "/tailnet", icon: Network, label: "Tailnet" },
  { to: "/dns", icon: Shell, label: "DNS" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export function Sidebar() {
  const status = useConnectionStore((s) => s.status);

  return (
    <aside className="flex h-screen w-56 flex-col border-r border-white/[0.06] bg-sidebar/60 backdrop-blur-2xl">
      <div className="h-12 flex items-center px-5 pt-2" data-tauri-drag-region>
        <span className="text-lg font-semibold text-primary" style={{ textShadow: "0 0 20px rgba(254,151,185,0.3)" }}>Calamity</span>
      </div>

      <div className="mx-4 mb-3 flex items-center gap-2 rounded-xl border border-white/[0.06] bg-muted/30 backdrop-blur-xl px-3 py-2">
        <span className="relative">
          <span
            className={cn(
              "block h-2 w-2 rounded-full",
              status === "connected" && "bg-green-500",
              status === "connecting" && "bg-yellow-500 animate-pulse",
              status === "disconnected" && "bg-muted-foreground/40"
            )}
          />
          {status === "connected" && (
            <span className="absolute inset-0 h-2 w-2 rounded-full bg-green-500 animate-ping opacity-75" />
          )}
        </span>
        <span className="text-xs font-medium text-muted-foreground capitalize">
          {status}
        </span>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-primary text-primary-foreground shadow-[0_0_15px_rgba(254,151,185,0.15)]"
                  : "text-sidebar-foreground hover:bg-white/[0.04]"
              )
            }
          >
            <Icon className="h-4 w-4" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-white/[0.06] p-4">
        <p className="text-[10px] text-muted-foreground/60 text-center">
          SingBox Core v1.8.4
        </p>
      </div>
    </aside>
  );
}
