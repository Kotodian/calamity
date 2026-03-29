import { describe, it, expect, vi } from "vitest";
import { logsService } from "../logs";

describe("logsService", () => {
  it("getLogs returns pre-populated entries", async () => {
    const logs = await logsService.getLogs();
    expect(logs.length).toBeGreaterThan(0);
    expect(logs[0]).toHaveProperty("id");
    expect(logs[0]).toHaveProperty("timestamp");
    expect(logs[0]).toHaveProperty("level");
    expect(logs[0]).toHaveProperty("message");
  });

  it("getLogs filters by level", async () => {
    const infos = await logsService.getLogs("info");
    for (const log of infos) {
      expect(log.level).toBe("info");
    }
  });

  it("clearLogs empties the log list", async () => {
    await logsService.clearLogs();
    const logs = await logsService.getLogs();
    expect(logs.length).toBe(0);
  });

  it("subscribeLogs emits entries via callback", async () => {
    vi.useFakeTimers();
    const entries: unknown[] = [];
    const unsub = logsService.subscribeLogs((entry) => entries.push(entry));

    await vi.advanceTimersByTimeAsync(4100);
    unsub();
    vi.useRealTimers();

    expect(entries.length).toBe(2);
  });
});
