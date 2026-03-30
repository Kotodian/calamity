import { describe, it, expect, beforeEach } from "vitest";
import { useRulesStore } from "../rules";

describe("useRulesStore", () => {
  beforeEach(() => {
    useRulesStore.setState({ rules: [], finalOutbound: { outbound: "proxy" } });
  });

  it("fetchRules loads rules from service", async () => {
    await useRulesStore.getState().fetchRules();
    expect(useRulesStore.getState().rules.length).toBeGreaterThan(0);
  });

  it("addRule appends and refreshes", async () => {
    await useRulesStore.getState().fetchRules();
    const before = useRulesStore.getState().rules.length;
    await useRulesStore.getState().addRule({
      name: "Store Test",
      enabled: true,
      matchType: "domain-suffix",
      matchValue: "store-test.com",
      outbound: "direct",
    });
    expect(useRulesStore.getState().rules.length).toBe(before + 1);
  });

  it("deleteRule removes and refreshes", async () => {
    await useRulesStore.getState().fetchRules();
    const rules = useRulesStore.getState().rules;
    const target = rules[rules.length - 1];
    await useRulesStore.getState().deleteRule(target.id);
    const after = useRulesStore.getState().rules;
    expect(after.find((r) => r.id === target.id)).toBeUndefined();
  });

  it("reorderRules changes order", async () => {
    await useRulesStore.getState().fetchRules();
    const rules = useRulesStore.getState().rules;
    const ids = rules.map((r) => r.id);
    const reversed = [...ids].reverse();
    await useRulesStore.getState().reorderRules(reversed);
    expect(useRulesStore.getState().rules[0].id).toBe(reversed[0]);
  });

  it("updateFinalOutbound changes final outbound", async () => {
    await useRulesStore.getState().updateFinalOutbound("reject");
    expect(useRulesStore.getState().finalOutbound.outbound).toBe("reject");
  });
});
