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
  Rss,
  PanelLeftClose,
  PanelLeftOpen,
  PackageSearch,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useConnectionStore } from "@/stores/connection";
import { useTranslation } from "react-i18next";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const { t } = useTranslation();
  const status = useConnectionStore((s) => s.status);
  const navItems = [
    { to: "/", icon: LayoutDashboard, label: t("sidebar.dashboard") },
    { to: "/nodes", icon: Globe, label: t("sidebar.nodes") },
    { to: "/rules", icon: Route, label: t("sidebar.rules") },
    { to: "/ruleset-market", icon: PackageSearch, label: t("sidebar.ruleSetMarket") },
    { to: "/connections", icon: Cable, label: t("sidebar.connections") },
    { to: "/logs", icon: ScrollText, label: t("sidebar.logs") },
    { to: "/subscriptions", icon: Rss, label: t("sidebar.subscriptions") },
    { to: "/tailnet", icon: Network, label: t("sidebar.tailnet") },
    { to: "/dns", icon: Shell, label: t("sidebar.dns") },
    { to: "/settings", icon: Settings, label: t("sidebar.settings") },
  ];

  return (
    <aside
      className={cn(
        "flex h-screen flex-col border-r border-white/[0.06] bg-sidebar/60 backdrop-blur-2xl transition-all duration-200",
        collapsed ? "w-20" : "w-56"
      )}
    >
      <div
        className={cn(
          "flex pt-2",
          collapsed ? "h-20 flex-col items-center justify-center gap-1 px-2" : "h-12 items-center justify-between px-5"
        )}
        data-tauri-drag-region
        data-testid="sidebar-header"
      >
        <span className="text-lg font-semibold text-primary" style={{ textShadow: "0 0 20px rgba(254,151,185,0.3)" }}>
          {collapsed ? "CA" : "Calamity"}
        </span>
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? t("sidebar.expand") : t("sidebar.collapse")}
          title={collapsed ? t("sidebar.expand") : t("sidebar.collapse")}
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-white/[0.04] hover:text-foreground"
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
      </div>

      <div
        className={cn(
          "mb-3 flex rounded-xl border border-white/[0.06] bg-muted/30 backdrop-blur-xl",
          collapsed ? "mx-2 justify-center px-2 py-2.5" : "mx-4 items-center gap-2 px-3 py-2"
        )}
      >
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
        {!collapsed ? (
          <span className="text-xs font-medium text-muted-foreground capitalize">
            {status}
          </span>
        ) : null}
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              cn(
                "flex rounded-lg py-2 text-sm font-medium transition-all duration-200",
                collapsed ? "justify-center px-2" : "items-center gap-3 px-3",
                isActive
                  ? "bg-primary text-primary-foreground shadow-[0_0_15px_rgba(254,151,185,0.15)]"
                  : "text-sidebar-foreground hover:bg-white/[0.04]"
              )
            }
            title={collapsed ? label : undefined}
          >
            <Icon className="h-4 w-4" />
            {!collapsed ? label : null}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-white/[0.06] p-4">
        <p className="text-[10px] text-muted-foreground/60 text-center">
          {collapsed ? "v1.8.4" : "SingBox Core v1.8.4"}
        </p>
      </div>
    </aside>
  );
}
