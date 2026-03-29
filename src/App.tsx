import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { DashboardPage } from "./pages/DashboardPage";
import { NodesPage } from "./pages/NodesPage";
import { RulesPage } from "./pages/RulesPage";
import { LogsPage } from "./pages/LogsPage";
import { TailnetPage } from "./pages/TailnetPage";
import { DnsPage } from "./pages/DnsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { ConnectionsPage } from "./pages/ConnectionsPage";
import { useEffect } from "react";
import { useSettingsStore } from "./stores/settings";
import { useConnectionStore } from "./stores/connection";

export default function App() {
  const fetchSettings = useSettingsStore((s) => s.fetchSettings);
  const fetchConnectionState = useConnectionStore((s) => s.fetchState);

  useEffect(() => {
    fetchSettings();
    fetchConnectionState();
  }, [fetchSettings, fetchConnectionState]);

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="nodes" element={<NodesPage />} />
          <Route path="rules" element={<RulesPage />} />
          <Route path="connections" element={<ConnectionsPage />} />
          <Route path="logs" element={<LogsPage />} />
          <Route path="tailnet" element={<TailnetPage />} />
          <Route path="dns" element={<DnsPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
