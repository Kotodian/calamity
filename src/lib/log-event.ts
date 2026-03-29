import type { LogEntry, LogLevel } from "../services/types";

export interface RawLogEvent {
  level: string;
  message: string;
  timestamp: string;
  source: string;
}

let logCounter = 0;

const LEVEL_MAP: Record<string, LogLevel> = {
  debug: "debug",
  info: "info",
  warn: "warn",
  warning: "warn",
  error: "error",
};

export function parseLogEvent(event: RawLogEvent): LogEntry {
  return {
    id: `log-${Date.now()}-${logCounter++}`,
    timestamp: new Date(Number(event.timestamp) || Date.now()).toISOString(),
    level: LEVEL_MAP[event.level] ?? "info",
    source: event.source,
    message: event.message,
  };
}
