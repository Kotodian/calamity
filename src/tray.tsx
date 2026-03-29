import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";

function TrayApp() {
  return (
    <div className="w-72 rounded-xl border border-border bg-background/95 p-3 backdrop-blur-xl shadow-lg">
      <p className="text-sm font-medium text-primary">Calamity Tray</p>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <TrayApp />
  </React.StrictMode>
);
