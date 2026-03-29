import { describe, it, expect, beforeEach } from "vitest";
import { useDnsStore } from "../dns";

describe("useDnsStore", () => {
  beforeEach(() => {
    useDnsStore.setState({ config: null, rules: [] });
  });

  it("fetchAll loads config and rules", async () => {
    await useDnsStore.getState().fetchAll();
    const { config, rules } = useDnsStore.getState();
    expect(config).not.toBeNull();
    expect(config!.mode).toBeTruthy();
    expect(config!.servers.length).toBeGreaterThan(0);
    expect(rules.length).toBeGreaterThan(0);
  });

  it("updateConfig changes mode", async () => {
    await useDnsStore.getState().fetchAll();
    await useDnsStore.getState().updateConfig({ mode: "direct" });
    expect(useDnsStore.getState().config!.mode).toBe("direct");
    await useDnsStore.getState().updateConfig({ mode: "redir-host" });
  });

  it("addRule appends and refreshes", async () => {
    await useDnsStore.getState().fetchAll();
    const before = useDnsStore.getState().rules.length;
    await useDnsStore.getState().addRule({
      id: "test-rule",
      matchType: "domain-suffix",
      matchValue: ".test.dev",
      server: "cf-https",
      enabled: true,
    });
    expect(useDnsStore.getState().rules.length).toBe(before + 1);
  });

  it("deleteRule removes and refreshes", async () => {
    await useDnsStore.getState().fetchAll();
    const rules = useDnsStore.getState().rules;
    const target = rules[rules.length - 1];
    await useDnsStore.getState().deleteRule(target.id);
    expect(useDnsStore.getState().rules.find((r) => r.id === target.id)).toBeUndefined();
  });

  it("addServer adds to config", async () => {
    await useDnsStore.getState().fetchAll();
    const before = useDnsStore.getState().config!.servers.length;
    await useDnsStore.getState().addServer({
      id: "test-srv",
      name: "Test",
      address: "1.2.3.4",
      enabled: true,
    });
    expect(useDnsStore.getState().config!.servers.length).toBe(before + 1);
  });

  it("deleteServer removes from config", async () => {
    await useDnsStore.getState().fetchAll();
    await useDnsStore.getState().deleteServer("test-srv");
    expect(useDnsStore.getState().config!.servers.find((s) => s.id === "test-srv")).toBeUndefined();
  });
});
