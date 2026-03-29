import { describe, it, expect } from "vitest";
import { dnsService } from "../dns";

describe("dnsService", () => {
  it("getConfig returns config with servers", async () => {
    const config = await dnsService.getConfig();
    expect(config.mode).toBeTruthy();
    expect(config.servers.length).toBeGreaterThan(0);
    expect(config.fakeIpRange).toBeTruthy();
  });

  it("updateConfig changes mode", async () => {
    await dnsService.updateConfig({ mode: "redir-host" });
    const config = await dnsService.getConfig();
    expect(config.mode).toBe("redir-host");
    await dnsService.updateConfig({ mode: "fake-ip" });
  });

  it("getRules returns DNS rules", async () => {
    const rules = await dnsService.getRules();
    expect(rules.length).toBeGreaterThan(0);
    expect(rules[0]).toHaveProperty("domain");
    expect(rules[0]).toHaveProperty("server");
  });

  it("addRule creates a new DNS rule", async () => {
    const before = await dnsService.getRules();
    const newRule = await dnsService.addRule({
      domain: "*.test.com",
      server: "TestDNS",
      enabled: true,
    });
    expect(newRule.id).toBeTruthy();
    const after = await dnsService.getRules();
    expect(after.length).toBe(before.length + 1);
  });

  it("deleteRule removes a DNS rule", async () => {
    const rules = await dnsService.getRules();
    const target = rules[rules.length - 1];
    await dnsService.deleteRule(target.id);
    const after = await dnsService.getRules();
    expect(after.find((r) => r.id === target.id)).toBeUndefined();
  });

  it("getCache returns cache entries", async () => {
    const cache = await dnsService.getCache();
    expect(cache.length).toBeGreaterThan(0);
    expect(cache[0]).toHaveProperty("domain");
    expect(cache[0]).toHaveProperty("ip");
  });

  it("clearCache empties the cache", async () => {
    await dnsService.clearCache();
    const cache = await dnsService.getCache();
    expect(cache.length).toBe(0);
  });
});
