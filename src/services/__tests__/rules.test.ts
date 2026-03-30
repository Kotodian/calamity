import { describe, it, expect } from "vitest";
import { rulesService } from "../rules";

describe("rulesService", () => {
  it("getFinalOutbound returns final outbound config", async () => {
    const final_ = await rulesService.getFinalOutbound();
    expect(final_.outbound).toBeTruthy();
  });

  it("updateFinalOutbound changes final outbound", async () => {
    await rulesService.updateFinalOutbound("direct");
    const final_ = await rulesService.getFinalOutbound();
    expect(final_.outbound).toBe("direct");
    expect(final_.outboundNode).toBeUndefined();
  });

  it("getRules returns sorted rules", async () => {
    const rules = await rulesService.getRules();
    expect(rules.length).toBeGreaterThan(0);
    for (let i = 1; i < rules.length; i++) {
      expect(rules[i].order).toBeGreaterThanOrEqual(rules[i - 1].order);
    }
  });

  it("addRule creates a new rule with generated id", async () => {
    const before = await rulesService.getRules();
    const newRule = await rulesService.addRule({
      name: "Test Rule",
      enabled: true,
      matchType: "domain-suffix",
      matchValue: "test.com",
      outbound: "direct",
    });
    expect(newRule.id).toBeTruthy();
    expect(newRule.name).toBe("Test Rule");

    const after = await rulesService.getRules();
    expect(after.length).toBe(before.length + 1);
  });

  it("updateRule modifies an existing rule", async () => {
    const rules = await rulesService.getRules();
    const target = rules[0];
    await rulesService.updateRule(target.id, { name: "Updated Name" });

    const updated = await rulesService.getRules();
    const found = updated.find((r) => r.id === target.id)!;
    expect(found.name).toBe("Updated Name");
  });

  it("deleteRule removes a rule", async () => {
    const rules = await rulesService.getRules();
    const target = rules[rules.length - 1];
    await rulesService.deleteRule(target.id);

    const after = await rulesService.getRules();
    expect(after.find((r) => r.id === target.id)).toBeUndefined();
  });

  it("reorderRules changes order", async () => {
    const rules = await rulesService.getRules();
    const ids = rules.map((r) => r.id);
    const reversed = [...ids].reverse();
    await rulesService.reorderRules(reversed);

    const reordered = await rulesService.getRules();
    expect(reordered[0].id).toBe(reversed[0]);
  });
});
