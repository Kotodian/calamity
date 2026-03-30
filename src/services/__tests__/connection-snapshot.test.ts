import { describe, expect, it } from "vitest";
import { buildConnectionSnapshot } from "../connection";

describe("buildConnectionSnapshot", () => {
  it("treats a running sing-box instance as connected even without an active node", () => {
    const snapshot = buildConnectionSnapshot({
      running: true,
      activeNode: null,
      proxyMode: "rule",
    });

    expect(snapshot.status).toBe("connected");
    expect(snapshot.mode).toBe("rule");
    expect(snapshot.activeNode).toBeNull();
  });
});
