import { describe, it, expect } from "vitest";
import { nodesService } from "../nodes";

describe("nodesService", () => {
  it("getGroups returns groups with nodes", async () => {
    const groups = await nodesService.getGroups();
    expect(groups.length).toBeGreaterThan(0);
    expect(groups[0].nodes.length).toBeGreaterThan(0);
    expect(groups[0].nodes[0]).toHaveProperty("id");
    expect(groups[0].nodes[0]).toHaveProperty("name");
    expect(groups[0].nodes[0]).toHaveProperty("latency");
  });

  it("getGroups returns copies", async () => {
    const a = await nodesService.getGroups();
    const b = await nodesService.getGroups();
    expect(a).not.toBe(b);
    expect(a[0].nodes).not.toBe(b[0].nodes);
  });

  it("testLatency returns a positive number and updates node", async () => {
    const groups = await nodesService.getGroups();
    const nodeId = groups[0].nodes[0].id;
    const latency = await nodesService.testLatency(nodeId);
    expect(latency).toBeGreaterThan(0);

    const updated = await nodesService.getGroups();
    const node = updated[0].nodes.find((n) => n.id === nodeId)!;
    expect(node.latency).toBe(latency);
  });

  it("setActiveNode marks only that node as active", async () => {
    const groups = await nodesService.getGroups();
    const targetId = groups[0].nodes[1].id;
    await nodesService.setActiveNode(targetId);

    const updated = await nodesService.getGroups();
    const allNodes = updated.flatMap((g) => g.nodes);
    const activeNodes = allNodes.filter((n) => n.active);
    expect(activeNodes.length).toBe(1);
    expect(activeNodes[0].id).toBe(targetId);
  });
});
