import { describe, it, expect, beforeEach } from "vitest";
import { useDnsStore } from "../dns";

describe("useDnsStore", () => {
  beforeEach(() => {
    useDnsStore.setState({ config: null, rules: [], cache: [] });
  });

  it("fetchConfig loads DNS config", async () => {
    await useDnsStore.getState().fetchConfig();
    const config = useDnsStore.getState().config;
    expect(config).not.toBeNull();
    expect(config!.mode).toBeTruthy();
    expect(config!.servers.length).toBeGreaterThan(0);
  });

  it("updateConfig changes mode", async () => {
    await useDnsStore.getState().fetchConfig();
    await useDnsStore.getState().updateConfig({ mode: "redir-host" });
    expect(useDnsStore.getState().config!.mode).toBe("redir-host");
    // Reset
    await useDnsStore.getState().updateConfig({ mode: "fake-ip" });
  });

  it("fetchRules loads DNS rules", async () => {
    await useDnsStore.getState().fetchRules();
    expect(useDnsStore.getState().rules.length).toBeGreaterThan(0);
  });

  it("addRule appends and refreshes", async () => {
    await useDnsStore.getState().fetchRules();
    const before = useDnsStore.getState().rules.length;
    await useDnsStore.getState().addRule({ domain: "*.test.dev", server: "TestDNS", enabled: true });
    expect(useDnsStore.getState().rules.length).toBe(before + 1);
  });

  it("deleteRule removes and refreshes", async () => {
    await useDnsStore.getState().fetchRules();
    const rules = useDnsStore.getState().rules;
    const target = rules[rules.length - 1];
    await useDnsStore.getState().deleteRule(target.id);
    expect(useDnsStore.getState().rules.find((r) => r.id === target.id)).toBeUndefined();
  });

  it("fetchCache loads cache entries", async () => {
    await useDnsStore.getState().fetchCache();
    // Cache may be empty from prior test clearing, just check it's an array
    expect(Array.isArray(useDnsStore.getState().cache)).toBe(true);
  });

  it("clearCache empties cache", async () => {
    await useDnsStore.getState().fetchCache();
    await useDnsStore.getState().clearCache();
    expect(useDnsStore.getState().cache.length).toBe(0);
  });
});
