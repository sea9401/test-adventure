import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const RELEASE_EXECUTABLES = [
  "toolkit/core/approvals.ts",
  "toolkit/cli/command.ts",
  "toolkit/cli/index.ts",
  "toolkit/cli/runtime.ts",
  "toolkit/pipelines/git.ts",
  "toolkit/pipelines/github.ts",
  "toolkit/pipelines/releaseState.ts",
  "toolkit/pipelines/stagingRelease.ts",
  "toolkit/pipelines/ciWatcher.ts",
  "toolkit/pipelines/deployWatcher.ts",
  "toolkit/pipelines/publicVerification.ts",
] as const;

describe("staging release policy", () => {
  it("contains no executable production, maintenance, force, or branch-deletion path", async () => {
    const source = (
      await Promise.all(
        RELEASE_EXECUTABLES.map((path) =>
          readFile(resolve(process.cwd(), path), "utf8"),
        ),
      )
    ).join("\n");

    expect(source).not.toContain('"deploy.yml"');
    expect(source).not.toContain("maintenance.sh");
    expect(source).not.toContain("production-next-");
    expect(source).not.toContain("https://msmsge.com");
    expect(source).not.toContain('"--delete-branch"');
    expect(source).not.toContain('"--force"');
    expect(source).not.toMatch(/(?:--base|base:)\s*[", ]+main/);
  });
});
