import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("manual release workflow", () => {
  it("supports manual dispatch and builds release artifacts", () => {
    const workflowPath = resolve(process.cwd(), ".github/workflows/manual-release.yml");
    const workflow = readFileSync(workflowPath, "utf8");

    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("contents: write");
    // macOS
    expect(workflow).toContain("macos-latest");
    expect(workflow).toContain("aarch64-apple-darwin");
    expect(workflow).toContain("npm run tauri build");
    // Linux
    expect(workflow).toContain("ubuntu-latest");
    expect(workflow).toContain("x86_64-unknown-linux-gnu");
    expect(workflow).toContain("aarch64-unknown-linux-gnu");
    // Tests
    expect(workflow).toContain("npm test");
    expect(workflow).toContain("cargo test --workspace");
    // Release management
    expect(workflow).toContain("gh release create");
    expect(workflow).toContain("gh release upload");
  });
});
