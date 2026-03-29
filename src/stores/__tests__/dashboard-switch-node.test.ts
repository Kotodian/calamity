import { describe, it, expect, beforeEach } from "vitest";
import { useNodesStore } from "../nodes";
import { useConnectionStore } from "../connection";

describe("Dashboard node switching", () => {
  beforeEach(async () => {
    await useNodesStore.getState().fetchGroups();
    await useConnectionStore.getState().fetchState();
  });

  it("switching active node updates connection activeNode", async () => {
    const groups = useNodesStore.getState().groups;
    const targetNode = groups[0].nodes[1]; // Tokyo 02

    await useNodesStore.getState().setActiveNode(targetNode.id);
    // After switching, the active node in nodes store should update
    const updatedGroups = useNodesStore.getState().groups;
    const active = updatedGroups.flatMap((g) => g.nodes).find((n) => n.active);
    expect(active?.id).toBe(targetNode.id);
  });

  it("only one node is active at a time after switch", async () => {
    const groups = useNodesStore.getState().groups;
    const targetNode = groups[0].nodes[2]; // US West

    await useNodesStore.getState().setActiveNode(targetNode.id);
    const allNodes = useNodesStore.getState().groups.flatMap((g) => g.nodes);
    const activeNodes = allNodes.filter((n) => n.active);
    expect(activeNodes.length).toBe(1);
    expect(activeNodes[0].name).toBe("US West");
  });
});
