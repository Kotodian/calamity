import { describe, it, expect, beforeEach } from "vitest";
import { useTailnetStore } from "../tailnet";

describe("useTailnetStore", () => {
  beforeEach(() => {
    useTailnetStore.setState({ devices: [] });
  });

  it("fetchDevices loads devices from service", async () => {
    await useTailnetStore.getState().fetchDevices();
    const devices = useTailnetStore.getState().devices;
    expect(devices.length).toBeGreaterThan(0);
    expect(devices[0]).toHaveProperty("ip");
  });

  it("setExitNode sets a device as current exit node", async () => {
    await useTailnetStore.getState().fetchDevices();
    const exitCapable = useTailnetStore.getState().devices.find(
      (d) => d.isExitNode && !d.isSelf
    )!;

    await useTailnetStore.getState().setExitNode(exitCapable.id);

    const current = useTailnetStore.getState().devices.filter((d) => d.isCurrentExitNode);
    expect(current.length).toBe(1);
    expect(current[0].id).toBe(exitCapable.id);
  });

  it("setExitNode with null clears exit node", async () => {
    await useTailnetStore.getState().fetchDevices();
    const exitCapable = useTailnetStore.getState().devices.find(
      (d) => d.isExitNode && !d.isSelf
    )!;
    await useTailnetStore.getState().setExitNode(exitCapable.id);
    await useTailnetStore.getState().setExitNode(null);

    const current = useTailnetStore.getState().devices.filter((d) => d.isCurrentExitNode);
    expect(current.length).toBe(0);
  });
});
