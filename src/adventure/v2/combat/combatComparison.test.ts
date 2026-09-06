import { expect, it } from "vitest";
import { compareCombatBuilds, type CombatComparisonInput } from "./combatComparison";

const player = { hp: 500, maxHp: 500, atk: 40, def: 10, spd: 100, evasionPct: 0, attackCount: 1, accuracyPct: 100, critChancePct: 30 };
const input: CombatComparisonInput = {
  codeVersion: "fixture-sha", trials: 4, seedBase: 42,
  builds: [{ name: "A", player }, { name: "B", player }],
  target: { kind: "pve", monster: { name: "target", hp: 200, atk: 1, def: 0, spd: 1, exp: 0, tags: [] } },
};

it("compares identical builds with paired seeds and preserves replayable input snapshots", () => {
  const before = structuredClone(input);
  const result = compareCombatBuilds(input);
  expect(result).toEqual(compareCombatBuilds(input));
  expect(input).toEqual(before);
  expect(result.input).toEqual(before);
  expect(result.builds[0].runs).toEqual(result.builds[1].runs);
  expect(result.builds[0].runs.map((run) => run.seed)).toEqual([42, 43, 44, 45]);
  expect(result.builds[0].summary.wins).toBe(4);
  expect(result.builds[0].summary.winRate).toBe(1);
  expect(result.builds[0].summary.averageTurns).toBeGreaterThan(0);
  result.input.builds[0].player.hp = 1;
  expect(input.builds[0].player.hp).toBe(500);
});

it("supports paired PvP comparisons without changing input gear or player state", () => {
  const result = compareCombatBuilds({ ...input, target: { kind: "pvp", player } });
  expect(result.builds[0].runs).toEqual(result.builds[1].runs);
  expect(result.builds[0].runs.every((run) => ["win", "loss", "draw"].includes(run.outcome))).toBe(true);
});

it("rejects invalid workload, seed and actor inputs before simulation", () => {
  for (const trials of [0, -1, 1.5, 1001, NaN]) {
    expect(() => compareCombatBuilds({ ...input, trials })).toThrow();
  }
  expect(() => compareCombatBuilds({ ...input, seedBase: -1 })).toThrow();
  expect(() => compareCombatBuilds({ ...input, codeVersion: "" })).toThrow();
  expect(() => compareCombatBuilds({ ...input, builds: [] })).toThrow();
  expect(() => compareCombatBuilds({ ...input, builds: [{ name: "bad", player: { ...player, attackCount: 1e9 } }, input.builds[1]] })).toThrow();
});

it("opt-in diagnostics preserve paired results and expose their partial coverage", () => {
  const normal = compareCombatBuilds(input);
  const detailed = compareCombatBuilds({ ...input, diagnostics: true });
  expect(detailed.builds[0].runs).toEqual(detailed.builds[1].runs);
  expect(detailed.builds[0].summary).toEqual(normal.builds[0].summary);
  expect(detailed.diagnosticCoverage?.complete).toBe(false);
  expect(detailed.builds[0].runs[0].diagnostics?.some((row) => row.metric === "hp_damage")).toBe(true);
  expect(normal.builds[0].runs[0]).not.toHaveProperty("diagnostics");
  expect(() => compareCombatBuilds({ ...input, diagnostics: "yes" as never })).toThrow();
});
