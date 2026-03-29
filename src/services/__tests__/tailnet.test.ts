import { describe, it, expect } from "vitest";
import { tailnetService } from "../tailnet";

describe("tailnetService", () => {
  it("getDevices returns devices with expected properties", async () => {
    const devices = await tailnetService.getDevices();
    expect(devices.length).toBeGreaterThan(0);
    expect(devices[0]).toHaveProperty("id");
    expect(devices[0]).toHaveProperty("ip");
    expect(devices[0]).toHaveProperty("status");
  });

  it("getDevices returns copies", async () => {
    const a = await tailnetService.getDevices();
    const b = await tailnetService.getDevices();
    expect(a).not.toBe(b);
  });

  it("setExitNode marks only that device as current exit node", async () => {
    const devices = await tailnetService.getDevices();
    const exitCapable = devices.find((d) => d.isExitNode && !d.isSelf)!;
    await tailnetService.setExitNode(exitCapable.id);

    const updated = await tailnetService.getDevices();
    const current = updated.filter((d) => d.isCurrentExitNode);
    expect(current.length).toBe(1);
    expect(current[0].id).toBe(exitCapable.id);
  });

  it("setExitNode with null clears exit node", async () => {
    await tailnetService.setExitNode(null);
    const updated = await tailnetService.getDevices();
    const current = updated.filter((d) => d.isCurrentExitNode);
    expect(current.length).toBe(0);
  });
});
