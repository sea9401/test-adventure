import { expect, it } from "vitest";
import { buildVenomComparisonMatrix } from "../../../../scripts/compare-venom-matrix";
import { compareCombatBuilds } from "./combatComparison";

it("varies pattern, defense and action window without changing progression within a pair", () => {
  const matrix = buildVenomComparisonMatrix("test", 2);
  expect(matrix.scenarios).toHaveLength(12);
  expect(new Set(matrix.scenarios.map((scenario) => scenario.name)).size).toBe(12);
  expect(new Set(matrix.scenarios.map((scenario) => scenario.defense))).toEqual(new Set([0, 1000]));
  expect(new Set(matrix.scenarios.map((scenario) => scenario.maxTurns))).toEqual(new Set([20, 120]));
  expect(new Set(matrix.scenarios.map((scenario) => scenario.pattern))).toEqual(new Set(["auto", "basic_only", "poison_cycle"]));
  for (const { input, defense, maxTurns } of matrix.scenarios) {
    expect(input.trials).toBe(2);
    expect(input.builds[0].skills).toEqual(input.builds[1].skills);
    expect(input.target.kind).toBe("pve");
    if (input.target.kind !== "pve") throw new Error("wrong target");
    expect(input.target.monster.def).toBe(defense);
    expect(input.target.monster.atk).toBe(1);
    expect(input.target.context?.maxTurns).toBe(maxTurns);
    for (const build of input.builds) {
      for (const block of build.skills?.pattern?.blocks ?? []) {
        if (block.action.kind === "skill") expect(build.skills?.learned).toContain(block.action.skillId);
      }
    }
  }
});

it("replays the matrix and reconciles both sides while honoring basic-only selection", () => {
  const matrix = buildVenomComparisonMatrix("test", 2);
  for (const scenario of matrix.scenarios) {
    const report = compareCombatBuilds(scenario.input);
    expect(compareCombatBuilds(scenario.input)).toEqual(report);
    for (const build of report.builds) for (const run of build.runs) {
      expect(run.hpLedger?.every((entry) => entry.balanced), scenario.name).toBe(true);
      if (scenario.pattern === "basic_only") {
        expect(run.diagnostics?.some((row) => row.metric === "skill_cast" && row.target === "player")).toBe(false);
      }
    }
  }
});
