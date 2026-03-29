import { describe, it, expect } from "vitest";
import { nodesService } from "../nodes";

describe("nodesService custom groups", () => {
  it("addGroup creates a new empty group", async () => {
    const before = await nodesService.getGroups();
    const group = await nodesService.addGroup("My VPS Nodes");

    expect(group.id).toBeTruthy();
    expect(group.name).toBe("My VPS Nodes");
    expect(group.nodes).toEqual([]);

    const after = await nodesService.getGroups();
    expect(after.length).toBe(before.length + 1);
  });

  it("removeGroup removes a group by id", async () => {
    const groups = await nodesService.getGroups();
    const custom = groups.find((g) => g.name === "My VPS Nodes")!;

    await nodesService.removeGroup(custom.id);
    const after = await nodesService.getGroups();
    expect(after.find((g) => g.id === custom.id)).toBeUndefined();
  });

  it("renameGroup changes group name", async () => {
    const group = await nodesService.addGroup("Old Name");
    await nodesService.renameGroup(group.id, "New Name");

    const groups = await nodesService.getGroups();
    expect(groups.find((g) => g.id === group.id)?.name).toBe("New Name");

    // cleanup
    await nodesService.removeGroup(group.id);
  });

  it("addNode to custom group works", async () => {
    const group = await nodesService.addGroup("Custom Group");
    await nodesService.addNode(group.id, {
      name: "Custom Node",
      server: "custom.com",
      port: 443,
      protocol: "Trojan",
      country: "Japan",
      countryCode: "JP",
    });

    const groups = await nodesService.getGroups();
    const found = groups.find((g) => g.id === group.id)!;
    expect(found.nodes.length).toBe(1);
    expect(found.nodes[0].name).toBe("Custom Node");

    // cleanup
    await nodesService.removeGroup(group.id);
  });
});
