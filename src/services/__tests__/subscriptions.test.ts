import { describe, it, expect } from "vitest";
import { subscriptionsService } from "../subscriptions";

describe("subscriptionsService", () => {
  it("getSubscriptions returns initial list with expected fields", async () => {
    const subs = await subscriptionsService.getSubscriptions();
    expect(subs.length).toBeGreaterThan(0);
    expect(subs[0]).toHaveProperty("id");
    expect(subs[0]).toHaveProperty("name");
    expect(subs[0]).toHaveProperty("url");
    expect(subs[0]).toHaveProperty("nodeCount");
    expect(subs[0]).toHaveProperty("trafficUsed");
    expect(subs[0]).toHaveProperty("trafficTotal");
    expect(subs[0]).toHaveProperty("autoUpdateInterval");
    expect(subs[0]).toHaveProperty("expire");
    expect(typeof subs[0].autoUpdateInterval).toBe("number");
  });

  it("addSubscription creates a new entry", async () => {
    const before = await subscriptionsService.getSubscriptions();
    const sub = await subscriptionsService.addSubscription({
      name: "Test Sub",
      url: "https://example.com/sub",
    });
    expect(sub.id).toBeTruthy();
    expect(sub.name).toBe("Test Sub");
    expect(sub.enabled).toBe(true);
    const after = await subscriptionsService.getSubscriptions();
    expect(after.length).toBe(before.length + 1);
  });

  it("removeSubscription deletes by id", async () => {
    const subs = await subscriptionsService.getSubscriptions();
    const last = subs[subs.length - 1];
    await subscriptionsService.removeSubscription(last.id);
    const after = await subscriptionsService.getSubscriptions();
    expect(after.find((s) => s.id === last.id)).toBeUndefined();
  });

  it("updateSubscription refreshes lastUpdated", async () => {
    const subs = await subscriptionsService.getSubscriptions();
    const target = subs[0];
    await subscriptionsService.updateSubscription(target.id);
    const after = await subscriptionsService.getSubscriptions();
    const updated = after.find((s) => s.id === target.id)!;
    expect(new Date(updated.lastUpdated).getTime()).toBeGreaterThanOrEqual(
      new Date(target.lastUpdated).getTime()
    );
  });

  it("toggleSubscription changes enabled state", async () => {
    const subs = await subscriptionsService.getSubscriptions();
    const target = subs[0];
    await subscriptionsService.toggleSubscription(target.id, false);
    const after = await subscriptionsService.getSubscriptions();
    expect(after.find((s) => s.id === target.id)!.enabled).toBe(false);
    await subscriptionsService.toggleSubscription(target.id, true);
  });

  it("editSubscription changes name and interval", async () => {
    const subs = await subscriptionsService.getSubscriptions();
    const target = subs[0];
    await subscriptionsService.editSubscription(target.id, {
      name: "Renamed",
      autoUpdateInterval: 86400,
    });
    const after = await subscriptionsService.getSubscriptions();
    const updated = after.find((s) => s.id === target.id)!;
    expect(updated.name).toBe("Renamed");
    expect(updated.autoUpdateInterval).toBe(86400);
  });
});
