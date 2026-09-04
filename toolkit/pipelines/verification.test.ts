import { describe, expect, it } from "vitest";

import type { ToolkitAdapter } from "../core/adapter";
import {
  selectFastChecks,
  selectFullChecks,
  type VerificationSelectionContext,
} from "./verification";

type Spec = { taskId: string; id: string };

function adapter(): ToolkitAdapter<Spec> {
  return {
    id: "fixture",
    specVersion: 1,
    parseSpec: (input) => input as Spec,
    plan: async () => [],
    validateGenerated: async () => [],
    selectFastChecks: () => [
      {
        id: "adapter-tests",
        command: "npx",
        args: ["vitest", "run", "toolkit/adapters/fixture"],
        dependsOn: [],
      },
      {
        id: "targeted-lint",
        command: "npx",
        args: ["eslint", "toolkit/adapters/fixture"],
        dependsOn: ["adapter-tests"],
      },
      {
        id: "boss-simulation",
        command: "npm",
        args: ["run", "sim:coop-boss"],
        dependsOn: ["targeted-lint"],
      },
    ],
    selectFullChecks: () => [],
  };
}

function context(changedPaths: readonly string[]): VerificationSelectionContext<Spec> {
  return {
    adapterContext: {
      projectRoot: "/project",
      taskId: "boss-echo-warden",
      taskRoot: "/project/.toolkit/work/boss-echo-warden",
      baseSha: "a".repeat(40),
    },
    spec: { taskId: "boss-echo-warden", id: "echo_warden" },
    changedPaths,
  };
}

describe("verification selection", () => {
  it("adds image and rights checks only for visual changes", () => {
    expect(
      selectFastChecks(context(["toolkit/core/taskState.ts"]), adapter()).map(
        (check) => check.id,
      ),
    ).not.toEqual(
      expect.arrayContaining(["images:references", "images:rights"]),
    );

    const visual = selectFastChecks(
      context(["public/images/equipment/new.webp"]),
      adapter(),
    );
    expect(visual.map((check) => check.id)).toEqual(
      expect.arrayContaining(["images:references", "images:rights"]),
    );
    expect(visual.every((check) => check.reason?.trim())).toBe(true);
  });

  it("builds the complete authoritative graph with fixed environments", () => {
    const checks = selectFullChecks(context([]), adapter());

    expect(checks.map((check) => check.id)).toEqual([
      "images",
      "rights",
      "typecheck",
      "lint",
      "unit",
      "simulation",
      "build",
      "diff",
    ]);
    expect(checks.find((check) => check.id === "typecheck")?.env).toEqual({
      NODE_OPTIONS: "--max-old-space-size=4096",
    });
    expect(checks.find((check) => check.id === "build")?.env).toEqual({
      NODE_OPTIONS: "--max-old-space-size=4096",
      V2_UNEXPLORED: "true",
    });
    expect(checks.find((check) => check.id === "simulation")?.args).toContain(
      "--boss=echo_warden",
    );
    expect(checks.every((check) => check.reason?.trim())).toBe(true);
  });

  it("blocks the authoritative graph while the adapter mechanic gate remains", () => {
    const blocked = adapter();
    blocked.selectFastChecks = () =>
      adapter()
        .selectFastChecks(context([]).adapterContext, context([]).spec)
        .filter((check) => check.id !== "boss-simulation");

    expect(() => selectFullChecks(context([]), blocked)).toThrow(
      "mechanic implementation blocks full verification",
    );
  });
});
