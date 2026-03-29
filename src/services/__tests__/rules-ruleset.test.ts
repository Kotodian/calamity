import { describe, it, expect } from "vitest";
import { rulesService } from "../rules";

describe("rulesService rule set download config", () => {
  it("rules with geosite/geoip have ruleSetUrl and downloadDetour", async () => {
    const rules = await rulesService.getRules();
    const geoRule = rules.find((r) => r.matchType === "geosite");
    expect(geoRule).toBeTruthy();
    expect(geoRule!.ruleSetUrl).toBeTruthy();
    expect(geoRule!.downloadDetour).toBeTruthy();
  });

  it("addRule with geosite sets default ruleSetUrl", async () => {
    const rule = await rulesService.addRule({
      name: "Test Geo",
      enabled: true,
      matchType: "geosite",
      matchValue: "google",
      outbound: "proxy",
      downloadDetour: "direct",
    });
    expect(rule.ruleSetUrl).toContain("geosite-google");
    expect(rule.downloadDetour).toBe("direct");
  });

  it("addRule with geoip sets default ruleSetUrl", async () => {
    const rule = await rulesService.addRule({
      name: "Test GeoIP",
      enabled: true,
      matchType: "geoip",
      matchValue: "cn",
      outbound: "direct",
      downloadDetour: "proxy",
      ruleSetUrl: "https://custom.example.com/geoip-cn.srs",
    });
    expect(rule.ruleSetUrl).toBe("https://custom.example.com/geoip-cn.srs");
    expect(rule.downloadDetour).toBe("proxy");
  });

  it("non-geo rules have no ruleSetUrl", async () => {
    const rule = await rulesService.addRule({
      name: "Domain Rule",
      enabled: true,
      matchType: "domain-suffix",
      matchValue: "example.com",
      outbound: "direct",
    });
    expect(rule.ruleSetUrl).toBeUndefined();
    expect(rule.downloadDetour).toBeUndefined();
  });

  it("updateRule can change downloadDetour", async () => {
    const rules = await rulesService.getRules();
    const geoRule = rules.find((r) => r.matchType === "geosite")!;
    await rulesService.updateRule(geoRule.id, { downloadDetour: "Tokyo 01" });

    const updated = await rulesService.getRules();
    expect(updated.find((r) => r.id === geoRule.id)!.downloadDetour).toBe("Tokyo 01");
  });
});
