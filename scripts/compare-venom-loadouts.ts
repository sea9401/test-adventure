import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { buildLevelDesignProgressionSnapshot } from "./sim-v2-level-design";
import { enemiesForDepth } from "../src/adventure/data/v2/dungeon";
import { V2_MONSTERS } from "../src/adventure/data/v2/v2Monsters";
import { scaleMonsterForFloor } from "../src/adventure/data/v2/monsterScale";
import type { V2EquipmentId, V2EquipSlot } from "../src/adventure/data/v2/v2Equipment";
import { compareCombatBuilds, type CombatComparisonInput } from "../src/adventure/v2/combat/combatComparison";

/** Catalog-derived examples, not a reconstruction of a live account. */
export function buildVenomComparisonCases(codeVersion: string, trials = 100) {
  const progression = { arch: "LUK" as const, depth: 84, careerWins: 500_000, cultivate: true, seed: 20260906, enhanceLevel: 12 };
  const six: Partial<Record<V2EquipSlot, V2EquipmentId>> = {
    weapon: "v2_storm_venom_dagger", armor: "v2_storm_venom_armor", gloves: "v2_storm_venom_gloves",
    boots: "v2_storm_venom_boots", ring: "v2_storm_venom_ring", necklace: "v2_storm_venom_necklace",
  };
  const loadouts = [
    { name: "venom-six", equipment: six },
    { name: "venom-five-plus-unique", equipment: { ...six, weapon: "v2_sky_sig_venom_dagger" as V2EquipmentId } },
  ].map((loadout) => ({ ...loadout, snapshot: buildLevelDesignProgressionSnapshot({ ...progression, equipment: loadout.equipment }) }));
  const builds = loadouts.map(({ name, snapshot }) => ({ name, player: snapshot.player, skills: snapshot.v2Skills }));
  const entry = enemiesForDepth(progression.depth)[0];
  if (!entry || !V2_MONSTERS[entry.key]) throw new Error("No catalog target at comparison depth");
  const monster = scaleMonsterForFloor(V2_MONSTERS[entry.key], progression.depth, true);
  const mage = buildLevelDesignProgressionSnapshot({ ...progression, arch: "INT" });
  const targets: CombatComparisonInput["target"][] = [
    { kind: "pve", monster, context: { depth: progression.depth, maxTurns: 200, forceAtbSkills: true } },
    // Synthetic sustained-damage probe: high HP, negligible incoming attack.
    { kind: "pve", monster: { ...monster, name: `${monster.name} (sustained probe)`, hp: monster.hp * 100, atk: 1 }, context: { depth: progression.depth, maxTurns: 200, forceAtbSkills: true } },
    { kind: "pvp", player: mage.player, skills: mage.v2Skills },
  ];
  const cases: CombatComparisonInput[] = targets.map((target) => ({ codeVersion, trials, seedBase: 20260906, diagnostics: true, builds, target }));
  return { progression, loadouts, cases };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const codeVersion = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    const workingTreeDirty = execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim().length > 0;
    const fixture = buildVenomComparisonCases(codeVersion);
    const reports = fixture.cases.map(compareCombatBuilds);
    console.log(JSON.stringify({ codeVersion, workingTreeDirty, progression: fixture.progression,
      loadouts: fixture.loadouts, reports: reports.map((report) => ({
        rules: report.rules, target: report.input.target, diagnosticCoverage: report.diagnosticCoverage,
        builds: report.builds.map((build) => ({ name: build.name, summary: build.summary,
          averageTargetRemainingHp: build.runs.reduce((sum, run) => sum + run.targetRemainingHp, 0) / build.runs.length,
          averageMetrics: Array.from(build.runs.reduce((totals, run) => {
            for (const row of run.diagnostics ?? []) {
              const key = JSON.stringify([row.metric, row.source, row.target]);
              totals.set(key, (totals.get(key) ?? 0) + row.total / build.runs.length);
            }
            return totals;
          }, new Map<string, number>()), ([key, total]) => ({ key: JSON.parse(key), total })),
        })),
      })),
    }, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Comparison failed");
    process.exitCode = 1;
  }
}
