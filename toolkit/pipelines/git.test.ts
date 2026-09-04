import { describe, expect, it } from "vitest";

import type { ToolkitTaskState } from "../schemas/task";
import { validateReleaseRepository } from "./git";

function task(): ToolkitTaskState {
  return {
    schemaVersion: 1,
    taskId: "boss-red",
    adapterId: "unexplored-boss",
    adapterSpecVersion: 1,
    specPath: "specs/boss-red.yaml",
    baseSha: "a".repeat(40),
    phase: "checkpoint",
    createdAt: "2026-09-02T00:00:00.000Z",
    updatedAt: "2026-09-02T00:00:00.000Z",
    steps: {},
    artifacts: [
      {
        scope: "project",
        path: "src/generated.ts",
        operation: "create",
        outputHash: "b".repeat(64),
        byteLength: 1,
      },
    ],
    approvals: [],
    manualPaths: ["docs/generated.md"],
  };
}

function repository(overrides = {}) {
  return {
    branch: "feat/echo-warden",
    headSha: "b".repeat(40),
    upstream: null,
    changedPaths: ["src/generated.ts"],
    unmergedPaths: [],
    operation: null,
    ...overrides,
  };
}

describe("validateReleaseRepository", () => {
  it("accepts planned changes on an isolated feature branch", () => {
    expect(() => validateReleaseRepository(task(), repository())).not.toThrow();
  });

  it.each(["main", "staging"])("rejects protected branch %s", (branch) => {
    expect(() =>
      validateReleaseRepository(task(), repository({ branch })),
    ).toThrow(`release branch must not be ${branch}`);
  });

  it("rejects detached, unmerged, in-progress, and unrelated changes", () => {
    expect(() =>
      validateReleaseRepository(task(), repository({ branch: null })),
    ).toThrow("release repository is detached");
    expect(() =>
      validateReleaseRepository(
        task(),
        repository({ unmergedPaths: ["src/conflict.ts"] }),
      ),
    ).toThrow("release repository has unmerged paths");
    expect(() =>
      validateReleaseRepository(task(), repository({ operation: "rebase" })),
    ).toThrow("release repository has an in-progress rebase");
    expect(() =>
      validateReleaseRepository(
        task(),
        repository({ changedPaths: ["notes/private.txt"] }),
      ),
    ).toThrow("unplanned changed path: notes/private.txt");
  });
});
