import type { LogEntry, LogLevel } from "./types";
import { parseLogEvent, type RawLogEvent } from "../lib/log-event";

export interface LogsService {
  getLogs(level?: LogLevel): Promise<LogEntry[]>;
  clearLogs(): Promise<void>;
  subscribeLogs(callback: (entry: LogEntry) => void): () => void;
}

// ---- Mock Implementation (dev / vitest) ----

const sampleMessages = [
  { level: "info" as LogLevel, source: "router", message: "matched rule: domain-suffix(google.com) => Proxy: Tokyo 01" },
  { level: "info" as LogLevel, source: "router", message: "matched rule: geosite(cn) => DIRECT" },
  { level: "debug" as LogLevel, source: "dns", message: "resolve github.com => fake-ip 198.18.0.42" },
  { level: "warn" as LogLevel, source: "outbound", message: "proxy Tokyo 02 health check failed, latency timeout" },
  { level: "info" as LogLevel, source: "inbound", message: "accepted connection from 127.0.0.1:52341" },
  { level: "error" as LogLevel, source: "outbound", message: "dial tcp 203.0.113.1:443: connection refused" },
  { level: "info" as LogLevel, source: "tun", message: "capture DNS query: api.github.com A" },
  { level: "debug" as LogLevel, source: "router", message: "sniffed TLS host: www.google.com" },
];

let mockLogs: LogEntry[] = [];
let logId = 0;

function generateLog(): LogEntry {
  const sample = sampleMessages[Math.floor(Math.random() * sampleMessages.length)];
  return {
    id: `log-${logId++}`,
    timestamp: new Date().toISOString(),
    ...sample,
  };
}

// Pre-populate
for (let i = 0; i < 50; i++) {
  mockLogs.push(generateLog());
}

const mockLogsService: LogsService = {
  async getLogs(level?) {
    const logs = level ? mockLogs.filter((l) => l.level === level) : mockLogs;
    return logs.map((l) => ({ ...l }));
  },
  async clearLogs() {
    mockLogs = [];
  },
  subscribeLogs(callback) {
    const interval = setInterval(() => {
      const entry = generateLog();
      mockLogs.push(entry);
      if (mockLogs.length > 500) mockLogs = mockLogs.slice(-500);
      callback(entry);
    }, 2000);
    return () => clearInterval(interval);
  },
};

// ---- Tauri Implementation (prod) ----

function createTauriLogsService(): LogsService {
  return {
    async getLogs() {
      // Clash API doesn't provide log history — logs are streaming only.
      return [];
    },
    async clearLogs() {
      // No-op on backend; frontend clears its local array.
    },
    subscribeLogs(callback) {
      let unlistenLog: (() => void) | null = null;
      let unlistenRestart: (() => void) | null = null;
      let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
      let stopped = false;
      let lastEventTime = Date.now();

      async function startStream() {
        const { invoke } = await import("@tauri-apps/api/core");
        for (let i = 0; i < 10 && !stopped; i++) {
          try {
            await invoke("start_log_stream", { level: "debug" });
            console.log("[logs] stream started");
            lastEventTime = Date.now();
            return;
          } catch {
            console.log(`[logs] retry ${i + 1}/10...`);
            await new Promise((r) => setTimeout(r, 2000));
          }
        }
        console.error("[logs] failed to start stream after retries");
      }

      (async () => {
        try {
          const { listen } = await import("@tauri-apps/api/event");

          if (stopped) return;

          unlistenLog = await listen<RawLogEvent>("singbox-log", (event) => {
            lastEventTime = Date.now();
            const entry = parseLogEvent(event.payload);
            callback(entry);
          });

          // Reconnect log stream when sing-box restarts
          unlistenRestart = await listen("singbox-restarted", () => {
            console.log("[logs] sing-box restarted, reconnecting stream...");
            startStream();
          });

          await startStream();

          // Heartbeat: if no log events for 30s, try to reconnect
          heartbeatTimer = setInterval(() => {
            if (!stopped && Date.now() - lastEventTime > 30000) {
              console.log("[logs] heartbeat: no events for 30s, reconnecting...");
              startStream();
            }
          }, 10000);
        } catch (e) {
          console.error("[logs] error:", e);
        }
      })();

      return () => {
        stopped = true;
        if (unlistenLog) unlistenLog();
        if (unlistenRestart) unlistenRestart();
        if (heartbeatTimer) clearInterval(heartbeatTimer);
      };
    },
  };
}

// ---- Export ----

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
export const logsService: LogsService = isTauri ? createTauriLogsService() : mockLogsService;
