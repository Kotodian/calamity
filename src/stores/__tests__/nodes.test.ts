import { describe, it, expect, beforeEach } from "vitest";
import { useNodesStore } from "../nodes";

describe("useNodesStore", () => {
  beforeEach(() => {
    useNodesStore.setState({ groups: [], selectedGroup: "proxy", testing: false });
  });

  it("fetchGroups loads groups from service", async () => {
    await useNodesStore.getState().fetchGroups();
    const groups = useNodesStore.getState().groups;
    expect(groups.length).toBeGreaterThan(0);
    expect(groups[0].nodes.length).toBeGreaterThan(0);
  });

  it("selectGroup changes selectedGroup", () => {
    useNodesStore.getState().selectGroup("auto");
    expect(useNodesStore.getState().selectedGroup).toBe("auto");
  });

  it("setActiveNode updates active node in store", async () => {
    await useNodesStore.getState().fetchGroups();
    const firstGroup = useNodesStore.getState().groups[0];
    const targetId = firstGroup.nodes[1].id;

    await useNodesStore.getState().setActiveNode(targetId);

    const allNodes = useNodesStore.getState().groups.flatMap((g) => g.nodes);
    const active = allNodes.filter((n) => n.active);
    expect(active.length).toBe(1);
    expect(active[0].id).toBe(targetId);
  });

  it("testAllLatency sets and clears testing flag", async () => {
    await useNodesStore.getState().fetchGroups();
    const promise = useNodesStore.getState().testAllLatency();
    // testing flag should eventually clear
    await promise;
    expect(useNodesStore.getState().testing).toBe(false);
    expect(useNodesStore.getState().groups[0].nodes[0].latency).toBeGreaterThan(0);
  });
});
