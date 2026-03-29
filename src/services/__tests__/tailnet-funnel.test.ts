import { describe, it, expect } from "vitest";
import { tailnetService } from "../tailnet";

describe("tailnetService funnel", () => {
  it("getFunnels returns empty initially", async () => {
    const funnels = await tailnetService.getFunnels();
    expect(funnels).toEqual([]);
  });

  it("addFunnel creates a funnel entry", async () => {
    const funnel = await tailnetService.addFunnel({ localPort: 3000, protocol: "https", allowPublic: true });
    expect(funnel.id).toBeTruthy();
    expect(funnel.localPort).toBe(3000);
    expect(funnel.protocol).toBe("https");
    expect(funnel.publicUrl).toContain(".ts.net");
    expect(funnel.enabled).toBe(true);
  });

  it("getFunnels returns added funnels", async () => {
    const funnels = await tailnetService.getFunnels();
    expect(funnels.length).toBe(1);
  });

  it("toggleFunnel disables a funnel", async () => {
    const funnels = await tailnetService.getFunnels();
    await tailnetService.toggleFunnel(funnels[0].id, false);
    const updated = await tailnetService.getFunnels();
    expect(updated[0].enabled).toBe(false);
  });

  it("removeFunnel deletes a funnel", async () => {
    const funnels = await tailnetService.getFunnels();
    await tailnetService.removeFunnel(funnels[0].id);
    const after = await tailnetService.getFunnels();
    expect(after.length).toBe(0);
  });
});
