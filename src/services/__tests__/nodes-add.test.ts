import { describe, it, expect } from "vitest";
import { nodesService } from "../nodes";

describe("nodesService.addNode", () => {
  it("adds a node to the specified group", async () => {
    const groups = await nodesService.getGroups();
    const before = groups[0].nodes.length;

    const newNode = await nodesService.addNode("proxy", {
      name: "Custom Node",
      server: "my.server.com",
      port: 443,
      protocol: "VMess",
      country: "Japan",
      countryCode: "JP",
    });

    expect(newNode.id).toBeTruthy();
    expect(newNode.name).toBe("Custom Node");
    expect(newNode.latency).toBeNull();
    expect(newNode.active).toBe(false);

    const after = await nodesService.getGroups();
    expect(after[0].nodes.length).toBe(before + 1);
  });

  it("removes a node by id", async () => {
    const groups = await nodesService.getGroups();
    const lastNode = groups[0].nodes[groups[0].nodes.length - 1];

    await nodesService.removeNode(lastNode.id);

    const after = await nodesService.getGroups();
    expect(after[0].nodes.find((n) => n.id === lastNode.id)).toBeUndefined();
  });
});
