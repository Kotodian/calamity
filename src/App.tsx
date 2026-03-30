import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import { AppLayout } from "./components/AppLayout";
import { DashboardPage } from "./pages/DashboardPage";
import { NodesPage } from "./pages/NodesPage";
import { RulesPage } from "./pages/RulesPage";
import { LogsPage } from "./pages/LogsPage";
import { TailnetPage } from "./pages/TailnetPage";
import { DnsPage } from "./pages/DnsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { ConnectionsPage } from "./pages/ConnectionsPage";
import { SubscriptionsPage } from "./pages/SubscriptionsPage";
import { useEffect } from "react";
import { toast } from "sonner";
import { useSettingsStore } from "./stores/settings";
import { useConnectionStore } from "./stores/connection";
import { useTranslation } from "react-i18next";

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
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="nodes" element={<NodesPage />} />
          <Route path="rules" element={<RulesPage />} />
          <Route path="connections" element={<ConnectionsPage />} />
          <Route path="logs" element={<LogsPage />} />
          <Route path="tailnet" element={<TailnetPage />} />
          <Route path="subscriptions" element={<SubscriptionsPage />} />
          <Route path="dns" element={<DnsPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
    </>
  );
}
