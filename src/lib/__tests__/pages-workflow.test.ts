import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("github pages docs", () => {
  it("includes a pages deployment workflow", () => {
    const workflowPath = resolve(process.cwd(), ".github/workflows/pages.yml");
    expect(existsSync(workflowPath)).toBe(true);

    const workflow = readFileSync(workflowPath, "utf8");
    expect(workflow).toContain("name: Deploy Pages");
    expect(workflow).toContain("actions/configure-pages@v5");
    expect(workflow).toContain("actions/upload-pages-artifact@v3");
    expect(workflow).toContain("actions/deploy-pages@v4");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("docs");
  });

  it("includes a static home page and a chinese manual", () => {
    const homePath = resolve(process.cwd(), "docs/index.html");
    const manualPath = resolve(process.cwd(), "docs/manual.html");

    expect(existsSync(homePath)).toBe(true);
    expect(existsSync(manualPath)).toBe(true);

    const home = readFileSync(homePath, "utf8");
    const manual = readFileSync(manualPath, "utf8");

    expect(home).toContain("Calamity Docs");
    expect(home).toContain("manual.html");
    expect(manual).toContain("操作手册");
    expect(manual).toContain("TUN");
    expect(manual).toContain("规则");
  });
});
