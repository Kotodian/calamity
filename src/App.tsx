import { HashRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { AppLayout } from "./components/AppLayout";
import { DashboardPage } from "./pages/DashboardPage";
import { lazy, Suspense, useEffect } from "react";
import { toast } from "sonner";
import { useSettingsStore } from "./stores/settings";
import { useConnectionStore } from "./stores/connection";
import { useTranslation } from "react-i18next";

const NodesPage = lazy(() => import("./pages/NodesPage").then((module) => ({ default: module.NodesPage })));
const RulesPage = lazy(() => import("./pages/RulesPage").then((module) => ({ default: module.RulesPage })));
const LogsPage = lazy(() => import("./pages/LogsPage").then((module) => ({ default: module.LogsPage })));
const TailnetPage = lazy(() => import("./pages/TailnetPage").then((module) => ({ default: module.TailnetPage })));
const DnsPage = lazy(() => import("./pages/DnsPage").then((module) => ({ default: module.DnsPage })));
const SettingsPage = lazy(() => import("./pages/SettingsPage").then((module) => ({ default: module.SettingsPage })));
const ConnectionsPage = lazy(() => import("./pages/ConnectionsPage").then((module) => ({ default: module.ConnectionsPage })));
const SubscriptionsPage = lazy(() => import("./pages/SubscriptionsPage").then((module) => ({ default: module.SubscriptionsPage })));
const RuleSetMarketPage = lazy(() => import("./pages/RuleSetMarketPage").then((module) => ({ default: module.RuleSetMarketPage })));
const BgpSyncPage = lazy(() => import("./pages/BgpSyncPage").then((module) => ({ default: module.BgpSyncPage })));
const FlowEditorPage = lazy(() => import("./pages/FlowEditorPage"));

function RouteLoadingFallback() {
  return (
    <div className="flex min-h-full items-center justify-center p-6 text-sm text-muted-foreground">
      Loading...
    </div>
  );
}

export default function App() {
  const { t } = useTranslation();
  const fetchSettings = useSettingsStore((s) => s.fetchSettings);
  const subscribeSettingsChanges = useSettingsStore((s) => s.subscribeSettingsChanges);
  const fetchConnectionState = useConnectionStore((s) => s.fetchState);
  const subscribeConnectionStateChanges = useConnectionStore((s) => s.subscribeStateChanges);

  useEffect(() => {
    fetchSettings();
    fetchConnectionState();

    // Listen for sing-box errors and settings changes
    let unlisten: (() => void) | null = null;
    const unsubscribeStateChanges = subscribeConnectionStateChanges();
    const unsubscribeSettings = subscribeSettingsChanges();
    (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        unlisten = await listen<string>("singbox-error", (event) => {
          toast.error(t("app.singboxError"), { description: event.payload, duration: 8000 });
        });
      } catch {}
    })();
    return () => {
      if (unlisten) unlisten();
      unsubscribeStateChanges();
      unsubscribeSettings();
    };
  }, [fetchSettings, subscribeSettingsChanges, fetchConnectionState, subscribeConnectionStateChanges, t]);

  return (
    <>
    <Toaster theme="dark" position="top-center" richColors />
    <AppErrorBoundary>
      <HashRouter>
        <Suspense fallback={<RouteLoadingFallback />}>
          <Routes>
            <Route element={<AppLayout />}>
              <Route index element={<DashboardPage />} />
              <Route path="nodes" element={<NodesPage />} />
              <Route path="rules" element={<RulesPage />} />
              <Route path="ruleset-market" element={<RuleSetMarketPage />} />
              <Route path="connections" element={<ConnectionsPage />} />
              <Route path="logs" element={<LogsPage />} />
              <Route path="tailnet" element={<TailnetPage />} />
              <Route path="tailnet/bgp-sync" element={<BgpSyncPage />} />
              <Route path="subscriptions" element={<SubscriptionsPage />} />
              <Route path="dns" element={<DnsPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="/flow" element={<FlowEditorPage />} />
            </Route>
          </Routes>
        </Suspense>
      </HashRouter>
    </AppErrorBoundary>
    </>
  );
}
