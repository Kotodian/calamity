import React from "react";
import ReactDOM from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import App from "./App";
import "./index.css";
import { getAppI18n, getSystemLocales, initAppI18n } from "./i18n";
import { settingsService } from "./services/settings";

async function bootstrap() {
  const settings = await settingsService.getSettings().catch(() => ({ language: "system" as const }));
  await initAppI18n({
    language: settings.language,
    systemLocales: getSystemLocales(),
  });

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <I18nextProvider i18n={getAppI18n()}>
        <App />
      </I18nextProvider>
    </React.StrictMode>
  );
}

void bootstrap();
