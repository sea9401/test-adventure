import { expect, it } from "vitest";
import { compareCombatBuilds, type CombatComparisonInput } from "./combatComparison";

const actor = { hp: 95, maxHp: 100, atk: 20, def: 5, spd: 100, evasionPct: 0, attackCount: 1,
  accuracyPct: 100, thornsPct: 25, runeCounterChancePct: 30, runeLifestealPct: 20,
  regen: { interval: 1, amount: 10 }, enduranceActive: true };

it.each(["pve", "pvp"])("reconciles seeded %s battles with recovery, counters and survival", (kind) => {
  const target: CombatComparisonInput["target"] = kind === "pve"
    ? { kind: "pve", monster: { name: "target", hp: 500, atk: 50, def: 0, spd: 6, exp: 0, tags: [] } }
    : { kind: "pvp", player: { ...actor, shadowStepPct: 30, evadeHealAmount: 20, reflexEvadeMult: 1, counterAtkBonus: 10 } };
  const input: CombatComparisonInput = { codeVersion: "fixture", trials: 100, seedBase: 42, diagnostics: true,
    builds: [{ name: "A", player: actor }, { name: "B", player: actor }], target };
  const report = compareCombatBuilds(input);
  for (const build of report.builds) {
    for (const run of build.runs) {
      expect(run.hpLedger, `${kind} seed ${run.seed}`).toHaveLength(2);
      expect(run.hpLedger?.map((entry) => entry.residual), `${kind} seed ${run.seed}`).toEqual([0, 0]);
    }
  }
  const plain = compareCombatBuilds({ ...input, diagnostics: false });
  expect(plain.builds[0].runs[0]).not.toHaveProperty("hpLedger");
  expect(report.builds.map((build) => build.summary)).toEqual(plain.builds.map((build) => build.summary));
});
