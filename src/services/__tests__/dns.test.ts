import { describe, it, expect } from "vitest";
import { dnsService } from "../dns";

describe("dnsService", () => {
  it("getSettings returns config and rules", async () => {
    const { config, rules } = await dnsService.getSettings();
    expect(config.mode).toBeTruthy();
    expect(config.servers.length).toBeGreaterThan(0);
    expect(config.fakeIpRange).toBeTruthy();
    expect(rules.length).toBeGreaterThan(0);
  });

  it("updateConfig changes mode", async () => {
    await dnsService.updateConfig({ mode: "direct" });
    const { config } = await dnsService.getSettings();
    expect(config.mode).toBe("direct");
    await dnsService.updateConfig({ mode: "redir-host" });
  });

  it("rules have matchType and matchValue", async () => {
    const { rules } = await dnsService.getSettings();
    expect(rules[0]).toHaveProperty("matchType");
    expect(rules[0]).toHaveProperty("matchValue");
    expect(rules[0]).toHaveProperty("server");
  });

  it("addRule creates a new DNS rule", async () => {
    const before = (await dnsService.getSettings()).rules;
    await dnsService.addRule({
      matchType: "domain-suffix",
      matchValue: ".test.com",
      server: "AliDNS",
      enabled: true,
    });
    const after = (await dnsService.getSettings()).rules;
    expect(after.length).toBe(before.length + 1);
  });

  it("deleteRule removes a DNS rule", async () => {
    const { rules } = await dnsService.getSettings();
    const target = rules[rules.length - 1];
    await dnsService.deleteRule(target.matchValue);
    const after = (await dnsService.getSettings()).rules;
    expect(after.find((r) => r.matchValue === target.matchValue)).toBeUndefined();
  });

  it("addServer adds a DNS server", async () => {
    const before = (await dnsService.getSettings()).config.servers;
    await dnsService.addServer({
      name: "Test",
      address: "1.2.3.4",
      enabled: true,
    });
    const after = (await dnsService.getSettings()).config.servers;
    expect(after.length).toBe(before.length + 1);
  });

  it("deleteServer removes server and related rules", async () => {
    await dnsService.deleteServer("Test");
    const { config } = await dnsService.getSettings();
    expect(config.servers.find((s) => s.name === "Test")).toBeUndefined();
  });
});
