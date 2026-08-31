import { describe, expect, it } from "vitest";
import {
  checkModuleBudgets,
  lineCount,
} from "../../scripts/module-budgets.mjs";

describe("checkModuleBudgets", () => {
  it("reports files that exceed their line budget", () => {
    const violations = checkModuleBudgets(
      [
        { path: "small.ts", maxLines: 10 },
        { path: "large.ts", maxLines: 20 },
      ],
      (path) => (path === "small.ts" ? 10 : 21),
    );

    expect(violations).toEqual([
      {
        path: "large.ts",
        lines: 21,
        maxLines: 20,
        reason: "line_budget",
      },
    ]);
  });

  it("reports missing budget targets instead of silently skipping them", () => {
    const violations = checkModuleBudgets(
      [{ path: "missing.ts", maxLines: 10 }],
      () => {
        throw new Error("ENOENT");
      },
    );

    expect(violations).toEqual([
      {
        path: "missing.ts",
        lines: null,
        maxLines: 10,
        reason: "missing",
      },
    ]);
  });

  it("counts the final line with or without a trailing newline", () => {
    expect(lineCount("")).toBe(0);
    expect(lineCount("one")).toBe(1);
    expect(lineCount("one\n")).toBe(1);
    expect(lineCount("one\ntwo")).toBe(2);
  });
});
