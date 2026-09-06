import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { buildVenomComparisonCases } from "./compare-venom-loadouts";
import { compareCombatBuilds, type CombatComparisonInput } from "../src/adventure/v2/combat/combatComparison";
import type { V2CombatPattern } from "../src/adventure/v2/combat/combatPattern";

/** Explicit synthetic sensitivity analysis; never reads accounts or env files. */
export function buildVenomComparisonMatrix(codeVersion: string, trials = 100) {
  const fixture = buildVenomComparisonCases(codeVersion, trials);
  const base = fixture.cases[1];
  if (base.target.kind !== "pve") throw new Error("Expected sustained PvE fixture");
  const patterns: Array<{ name: string; value?: V2CombatPattern }> = [
    { name: "auto" },
    { name: "basic_only", value: { blocks: [{ condition: { kind: "always" }, action: { kind: "basic_attack" } }] } },
    { name: "poison_cycle", value: { blocks: [
      { condition: { kind: "enemy_status", tag: "poison", op: "atLeast", stacks: 5 }, action: { kind: "basic_attack" } },
      { condition: { kind: "always" }, action: { kind: "skill", skillId: "v2c_blackmoon_flurry" } },
    ] } },
  ];
  const scenarios: Array<{ name: string; pattern: string; defense: number; maxTurns: number; input: CombatComparisonInput }> = [];
  for (const pattern of patterns) for (const defense of [0, 1000]) for (const maxTurns of [20, 120]) {
    const name = `${pattern.name}/def-${defense}/turns-${maxTurns}`;
    const input: CombatComparisonInput = {
      ...structuredClone(base),
      builds: base.builds.map((build) => {
        if (!build.skills) throw new Error("Missing shared skill loadout");
        return { ...structuredClone(build), skills: { ...structuredClone(build.skills), pattern: structuredClone(pattern.value) } };
      }),
      target: { kind: "pve", monster: { ...structuredClone(base.target.monster), name: `synthetic ${name}`, def: defense },
        context: { ...base.target.context, maxTurns } },
    };
    scenarios.push({ name, pattern: pattern.name, defense, maxTurns, input });
  }
  return { progression: fixture.progression, loadouts: fixture.loadouts, scenarios };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const codeVersion = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    const workingTreeDirty = execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim().length > 0;
    const matrix = buildVenomComparisonMatrix(codeVersion);
    const scenarios = matrix.scenarios.map((scenario) => {
      const report = compareCombatBuilds(scenario.input);
      const target = scenario.input.target;
      if (target.kind !== "pve") throw new Error("Expected PvE target");
      return { name: scenario.name, pattern: scenario.pattern, defense: scenario.defense, maxTurns: scenario.maxTurns,
        rules: report.rules, target, seedBase: scenario.input.seedBase, trials: scenario.input.trials,
        diagnosticCoverage: report.diagnosticCoverage,
        builds: report.builds.map((build) => ({ name: build.name, summary: build.summary,
          averageTargetHpLoss: build.runs.reduce((sum, run) => sum + target.monster.hp - run.targetRemainingHp, 0) / build.runs.length,
          unbalancedRuns: build.runs.filter((run) => !run.hpLedger?.every((entry) => entry.balanced)).length,
          maxAbsResidual: Math.max(...build.runs.flatMap((run) => run.hpLedger?.map((entry) => Math.abs(entry.residual)) ?? [0])),
          averagePlayerCasts: build.runs.reduce((sum, run) => sum + (run.diagnostics ?? []).filter((row) => row.metric === "skill_cast" && row.target === "player").reduce((total, row) => total + row.total, 0), 0) / build.runs.length,
          averagePoisonDamage: build.runs.reduce((sum, run) => sum + (run.diagnostics ?? []).filter((row) => row.metric === "hp_damage" && row.source === "poison" && row.target === "enemy").reduce((total, row) => total + row.total, 0), 0) / build.runs.length,
          averageBurstDamage: build.runs.reduce((sum, run) => sum + (run.diagnostics ?? []).filter((row) => row.metric === "hp_damage" && row.source === "unique:venom_burst" && row.target === "enemy").reduce((total, row) => total + row.total, 0), 0) / build.runs.length,
        })),
      };
    });
    console.log(JSON.stringify({ formatVersion: 1, codeVersion, workingTreeDirty, randomAlgorithm: "mulberry32-v1",
      progression: matrix.progression, loadouts: matrix.loadouts, scenarios }, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Matrix comparison failed");
    process.exitCode = 1;
  }
}
