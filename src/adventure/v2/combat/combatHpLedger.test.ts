import { expect, it } from "vitest";
import type { CombatDiagnosticRow } from "./combatDiagnostics";
import { reconcileCombatHp } from "./combatHpLedger";

const rows: CombatDiagnosticRow[] = [
  { metric: "hp_damage", source: "hit", target: "player", total: 40, count: 1 },
  { metric: "healing", source: "potion", target: "player", total: 5, count: 1 },
  { metric: "survival_restoration", source: "endurance", target: "player", total: 1, count: 1 },
];
const baseline = [{ target: "player", initialHp: 100, finalHp: 66 }];

it("reconciles HP damage, actual recovery and survival independently", () => {
  expect(reconcileCombatHp(rows, baseline)).toEqual([{
    ...baseline[0], damage: 40, healing: 5, survivalRestoration: 1, expectedHp: 66, residual: 0, balanced: true,
  }]);
  expect(rows[0].total).toBe(40);
});
it("detects missing recovery and duplicate damage without clamping them away", () => {
  expect(reconcileCombatHp(rows.filter((row) => row.metric !== "healing"), baseline)[0]).toMatchObject({ residual: 5, balanced: false });
  expect(reconcileCombatHp([...rows, rows[0]], baseline)[0]).toMatchObject({ residual: 40, balanced: false });
  expect(reconcileCombatHp([{ ...rows[0], total: 150 }], [{ target: "player", initialHp: 100, finalHp: 0 }])[0]).toMatchObject({ expectedHp: -50, residual: 50, balanced: false });
});
it("does not treat shield, resolved damage or another actor as additional HP loss", () => {
  const noise: CombatDiagnosticRow[] = [
    { ...rows[0], metric: "shield_absorption", total: 500 },
    { ...rows[0], metric: "resolved_damage", total: 500 },
    { ...rows[0], metric: "skill_cast", total: 5 },
    { ...rows[0], target: "enemy", total: 20 },
  ];
  expect(reconcileCombatHp([...rows, ...noise], baseline)[0].balanced).toBe(true);
  expect(reconcileCombatHp(noise, [{ target: "enemy", initialHp: 50, finalHp: 30 }])[0].balanced).toBe(true);
});
it("rejects invalid baselines, duplicate targets and invalid HP totals", () => {
  for (const value of [NaN, Infinity, -1]) {
    expect(() => reconcileCombatHp(rows, [{ ...baseline[0], initialHp: value }])).toThrow();
    expect(() => reconcileCombatHp(rows, [{ ...baseline[0], finalHp: value }])).toThrow();
    expect(() => reconcileCombatHp([{ ...rows[0], total: value }], baseline)).toThrow();
  }
  expect(() => reconcileCombatHp(rows, [...baseline, ...baseline])).toThrow();
  expect(() => reconcileCombatHp(rows, [{ ...baseline[0], target: "" }])).toThrow();
});
it("tolerates only floating point roundoff, not whole missing HP", () => {
  expect(reconcileCombatHp([], [{ target: "p1", initialHp: 100, finalHp: 100 + 1e-9 }])[0].balanced).toBe(true);
  expect(reconcileCombatHp([], [{ target: "p1", initialHp: 100, finalHp: 101 }])[0].balanced).toBe(false);
});
