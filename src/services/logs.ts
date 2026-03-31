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
      return [];
    },
    async clearLogs() {},
    subscribeLogs(callback) {
      let unlistenLog: (() => void) | null = null;
      let unlistenRestart: (() => void) | null = null;
      let stopped = false;

      // Batch log events to avoid per-event re-renders
      let pending: LogEntry[] = [];
      let flushTimer: ReturnType<typeof setTimeout> | null = null;

      function flush() {
        flushTimer = null;
        const batch = pending;
        pending = [];
        for (const entry of batch) {
          callback(entry);
        }
      }

      function enqueue(entry: LogEntry) {
        pending.push(entry);
        if (!flushTimer) {
          flushTimer = setTimeout(flush, 100);
        }
      }

      async function startStream() {
        if (stopped) return;
        try {
          const { invoke } = await import("@tauri-apps/api/core");
          await invoke("start_log_stream", { level: "debug" });
        } catch {
          // sing-box not running — stream will start when it does via restart event
        }
      }

      (async () => {
        try {
          const { listen } = await import("@tauri-apps/api/event");

          if (stopped) return;

          unlistenLog = await listen<RawLogEvent>("singbox-log", (event) => {
            enqueue(parseLogEvent(event.payload));
          });

          unlistenRestart = await listen("singbox-restarted", () => {
            startStream();
          });

          await startStream();
        } catch (e) {
          console.error("[logs] error:", e);
        }
      })();

      return () => {
        stopped = true;
        if (flushTimer) clearTimeout(flushTimer);
        if (unlistenLog) unlistenLog();
        if (unlistenRestart) unlistenRestart();
      };
    },
  };
}

// ---- Export ----

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
export const logsService: LogsService = isTauri ? createTauriLogsService() : mockLogsService;
