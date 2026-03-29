import { describe, it, expect, beforeEach } from "vitest";
import { useNodesStore } from "../nodes";

describe("useNodesStore add/remove", () => {
  beforeEach(async () => {
    useNodesStore.setState({ groups: [], selectedGroup: "proxy", testing: false });
    await useNodesStore.getState().fetchGroups();
  });

  it("addNode adds to store and refreshes", async () => {
    const before = useNodesStore.getState().groups[0].nodes.length;

    await useNodesStore.getState().addNode("proxy", {
      name: "My VPS",
      server: "vps.example.com",
      port: 8443,
      protocol: "Trojan",
      country: "Germany",
      countryCode: "DE",
    });

    const after = useNodesStore.getState().groups[0].nodes.length;
    expect(after).toBe(before + 1);

    const added = useNodesStore.getState().groups[0].nodes.find((n) => n.name === "My VPS");
    expect(added).toBeTruthy();
    expect(added!.server).toBe("vps.example.com");
  });

  it("removeNode removes from store and refreshes", async () => {
    const nodes = useNodesStore.getState().groups[0].nodes;
    const last = nodes[nodes.length - 1];

    await useNodesStore.getState().removeNode(last.id);

    const after = useNodesStore.getState().groups[0].nodes;
    expect(after.find((n) => n.id === last.id)).toBeUndefined();
  });
});
