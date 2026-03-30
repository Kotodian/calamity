import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("manual release workflow", () => {
  it("supports manual dispatch and builds Tauri release artifacts", () => {
    const workflowPath = resolve(process.cwd(), ".github/workflows/manual-release.yml");
    const workflow = readFileSync(workflowPath, "utf8");

    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("tauri-apps/tauri-action@v1");
    expect(workflow).toContain("uploadWorkflowArtifacts: true");
    expect(workflow).toContain("contents: write");
    expect(workflow).toContain("macos-latest");
    expect(workflow).toContain("aarch64-apple-darwin");
    expect(workflow).not.toContain("x86_64-apple-darwin");
    expect(workflow).toContain("npm test");
    expect(workflow).toContain("cargo test --manifest-path src-tauri/Cargo.toml");
  });
});
