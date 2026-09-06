import type { Monster } from "@/adventure/data/monsters";
import { V2_ATB_SKILLS, V2_CORE_LOOP_V2, V2_SKILL_PROC_IN_PATTERN } from "@/adventure/data/v2/coreLoopConfig";
import type { V2SkillsState } from "@/adventure/data/v2/v2Skills";
import { resolveBattle, type PlayerCombat, type ResolveContext } from "./engine";
import { resolveBattlePvP } from "./engine-pvp";
import { seededCombatRandom } from "./combatRandom";
import { createCombatDiagnostics, withCombatDiagnostics, type CombatDiagnosticRow } from "./combatDiagnostics";
import { reconcileCombatHp } from "./combatHpLedger";

export type CombatComparisonInput = {
  /** Exact source/artifact revision, supplied by the local caller. */
  codeVersion: string;
  trials: number;
  seedBase: number;
  diagnostics?: boolean;
  builds: Array<{ name: string; player: PlayerCombat; skills?: V2SkillsState }>;
  target: {
    kind: "pve";
    monster: Monster;
    context?: Pick<ResolveContext, "isBoss" | "maxHpDamageMult" | "maxTurns" | "depth" | "forceAtbSkills" | "bossMechanic" | "damageMeter">;
  } | {
    kind: "pvp";
    player: PlayerCombat;
    skills?: V2SkillsState;
    damageMultiplier?: number;
    sustainMultiplier?: number;
  };
};

type Trial = {
  seed: number;
  outcome: "win" | "loss" | "draw";
  timeout: boolean;
  turns: number;
  playerRemainingHp: number;
  targetRemainingHp: number;
  diagnostics?: CombatDiagnosticRow[];
  hpLedger?: ReturnType<typeof reconcileCombatHp>;
};

function validateActor(player: PlayerCombat) {
  if (!player || [player.hp, player.maxHp, player.atk, player.def, player.spd, player.evasionPct, player.attackCount]
      .some((value) => typeof value !== "number" || !Number.isFinite(value) || value < 0) ||
      !(player.hp > 0) || !(player.maxHp > 0) || player.hp > player.maxHp ||
      !Number.isInteger(player.attackCount) || player.attackCount < 1 || player.attackCount > 100 ||
      (player.extraAttackChancePct ?? 0) > 10_000 || (player.extraAttackChancePctWhileEnemyBleeding ?? 0) > 10_000) {
    throw new Error("Invalid comparison actor HP or attack count");
  }
}

function validateNumbers(value: unknown, depth = 0): void {
  if (depth > 30) throw new Error("Comparison input nesting exceeds limit");
  if (typeof value === "number" && (!Number.isFinite(value) || Math.abs(value) > 1e15)) {
    throw new Error("Comparison input contains an invalid number");
  }
  if (Array.isArray(value) && value.length > 1000) throw new Error("Comparison input array exceeds limit");
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) validateNumbers(child, depth + 1);
  }
}

/** Local analysis only. No DB reads, live writes or automatic balance decisions. */
export function compareCombatBuilds(input: CombatComparisonInput) {
  if (!input || !Number.isInteger(input.trials) || input.trials < 1 || input.trials > 1000 ||
      typeof input.codeVersion !== "string" || !input.codeVersion.trim() ||
      !Array.isArray(input.builds) || input.builds.length < 2 || input.builds.length > 8 ||
      !input.target || !["pve", "pvp"].includes(input.target.kind) ||
      (input.diagnostics !== undefined && typeof input.diagnostics !== "boolean")) {
    throw new Error("Comparison requires a revision, 2–8 builds and 1–1000 trials");
  }
  seededCombatRandom(input.seedBase);
  validateNumbers(input);
  for (const build of input.builds) {
    if (!build.name?.trim()) throw new Error("Build name is required");
    validateActor(build.player);
  }
  if (input.target.kind === "pvp") validateActor(input.target.player);
  else if (!input.target.monster || !(input.target.monster.hp > 0) ||
      [input.target.monster.hp, input.target.monster.atk, input.target.monster.def, input.target.monster.spd]
        .some((value) => typeof value !== "number" || !Number.isFinite(value) || value < 0)) {
    throw new Error("Target HP and combat stats must be valid");
  }

  const snapshot = structuredClone(input);
  const builds = snapshot.builds.map((build) => {
    const runs: Trial[] = [];
    for (let index = 0; index < snapshot.trials; index += 1) {
      const seed = (snapshot.seedBase + index) >>> 0;
      // Every trial owns fresh objects: future engine changes cannot pollute later cases.
      const actor = structuredClone(build);
      const target = structuredClone(snapshot.target);
      const diagnostics = snapshot.diagnostics ? createCombatDiagnostics() : undefined;
      if (target.kind === "pve") {
        const result = withCombatDiagnostics(diagnostics, () => resolveBattle(actor.player, target.monster, actor.name, {
          ...target.context, v2Skills: actor.skills, potions: {},
          pickAction: () => ({ kind: "attack" }), random: seededCombatRandom(seed), logMode: "summary",
        }));
        runs.push({ seed, outcome: result.outcome === "win" ? "win" : "loss", timeout: result.endReason === "timeout",
          turns: result.turns, playerRemainingHp: result.finalState.playerHp, targetRemainingHp: result.finalState.enemyHp });
      } else {
        const result = withCombatDiagnostics(diagnostics, () => resolveBattlePvP(actor.player, target.player, actor.name, "target", {
          damageMultiplier: target.damageMultiplier, sustainMultiplier: target.sustainMultiplier,
          v2Skills: { p1: actor.skills, p2: target.skills }, potions: { p1: {}, p2: {} },
          pickAction: () => ({ kind: "attack" }), random: seededCombatRandom(seed), logMode: "summary",
        }));
        runs.push({ seed, outcome: result.outcome === "p1_win" ? "win" : result.outcome === "p2_win" ? "loss" : "draw",
          timeout: false, turns: result.turns, playerRemainingHp: result.finalState.p1.hp, targetRemainingHp: result.finalState.p2.hp });
      }
      if (diagnostics) {
        const run = runs[runs.length - 1];
        run.diagnostics = diagnostics.snapshot();
        run.hpLedger = reconcileCombatHp(run.diagnostics, [
          { target: target.kind === "pve" ? "player" : "p1", initialHp: actor.player.hp, finalHp: run.playerRemainingHp },
          { target: target.kind === "pve" ? "enemy" : "p2", initialHp: target.kind === "pve" ? target.monster.hp : target.player.hp, finalHp: run.targetRemainingHp },
        ]);
      }
    }
    const wins = runs.filter((run) => run.outcome === "win").length;
    return { name: build.name, runs, summary: {
      wins, losses: runs.filter((run) => run.outcome === "loss").length,
      draws: runs.filter((run) => run.outcome === "draw").length,
      timeouts: runs.filter((run) => run.timeout).length,
      winRate: wins / runs.length,
      averageTurns: runs.reduce((sum, run) => sum + run.turns, 0) / runs.length,
      averageRemainingHp: runs.reduce((sum, run) => sum + run.playerRemainingHp, 0) / runs.length,
    } };
  });
  return {
    formatVersion: 1, randomAlgorithm: "mulberry32-v1",
    ...(snapshot.diagnostics ? { diagnosticCoverage: {
      complete: false,
      covered: ["primary direct attacks/skills including enemy skills", "tagged DoT ticks", "primary-hit mana/normal shields", "observed selector gates", "committed cast boundaries", "tier6 unique commands", "sword shadow", "on-hit and dodge reflection", "PvE/PvP rune/martial/dodge counters", "extra attacks", "active potion/evasion/regen/lifesteal/bleed healing", "standard berserker/endurance restoration"],
      excluded: ["remaining special effects such as PvP freeze burst", "boss-specific HP damage/reset paths", "HP costs and maximum-HP transforms", "inactive AP adapters", "shield expiry", "unvisited selector candidates"],
    } } : {}),
    rules: { coreLoopV2: V2_CORE_LOOP_V2, atbSkills: V2_ATB_SKILLS, skillProcInPattern: V2_SKILL_PROC_IN_PATTERN },
    input: snapshot, builds,
    notes: ["Remaining HP is not cumulative damage or healing.", "Paired seeds align initial streams, not every draw after different actions.", "PvP draws are not classified as timeouts by this report.", "HP ledger uses input HP as baseline; zero residual is not proof of complete coverage."],
  };
}
