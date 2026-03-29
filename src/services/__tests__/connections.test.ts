import { describe, it, expect, vi } from "vitest";
import { connectionsService } from "../connections";

describe("connectionsService", () => {
  it("getConnections returns records with expected fields", async () => {
    const records = await connectionsService.getConnections();
    expect(records.length).toBeGreaterThan(0);
    expect(records[0]).toHaveProperty("id");
    expect(records[0]).toHaveProperty("timestamp");
    expect(records[0]).toHaveProperty("host");
    expect(records[0]).toHaveProperty("matchedRule");
    expect(records[0]).toHaveProperty("outbound");
    expect(records[0]).toHaveProperty("duration");
    expect(records[0]).toHaveProperty("network");
  });

  it("getStats returns summary counts", async () => {
    const stats = await connectionsService.getStats();
    expect(stats.total).toBeGreaterThan(0);
    expect(typeof stats.proxy).toBe("number");
    expect(typeof stats.direct).toBe("number");
    expect(typeof stats.reject).toBe("number");
  });

  it("clearConnections empties the list", async () => {
    await connectionsService.clearConnections();
    const records = await connectionsService.getConnections();
    expect(records.length).toBe(0);
  });

  it("subscribe emits connection record arrays", async () => {
    vi.useFakeTimers();
    const snapshots: unknown[][] = [];
    const unsub = connectionsService.subscribe((records) => snapshots.push(records));
    await vi.advanceTimersByTimeAsync(3100);
    unsub();
    vi.useRealTimers();
    expect(snapshots.length).toBe(3);
    expect(Array.isArray(snapshots[0])).toBe(true);
  });
});
