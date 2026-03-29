import { describe, it, expect } from "vitest";
import { parseLogEvent } from "../log-event";

describe("parseLogEvent", () => {
  it("parses a log event payload into LogEntry", () => {
    const event = {
      level: "info",
      message: "matched rule: domain-suffix(google.com) => Proxy",
      timestamp: "1711700000000",
      source: "router",
    };
    const entry = parseLogEvent(event);
    expect(entry.level).toBe("info");
    expect(entry.source).toBe("router");
    expect(entry.message).toBe("matched rule: domain-suffix(google.com) => Proxy");
    expect(entry.id).toBeTruthy();
    expect(entry.timestamp).toBeTruthy();
  });

  it("maps warning level to warn", () => {
    const event = {
      level: "warning",
      message: "timeout",
      timestamp: "1711700000000",
      source: "outbound",
    };
    const entry = parseLogEvent(event);
    expect(entry.level).toBe("warn");
  });

  it("defaults unknown level to info", () => {
    const event = {
      level: "trace",
      message: "something",
      timestamp: "1711700000000",
      source: "system",
    };
    const entry = parseLogEvent(event);
    expect(entry.level).toBe("info");
  });
});
