// 새 방어 체계 기준 협동 보스 3,000 ATB 틱 밸런스 점검기.
// 실행:
//   npm run sim:coop-boss
//   npm run sim:coop-boss -- --trials=50 --json

import { pathToFileURL } from "node:url";

import {
  COOP_ATTACK_TURNS,
  COOP_BOSSES,
  COOP_BOSS_KIND_IDS,
  coopBossForBattle,
  type CoopBossKindId,
} from "../src/adventure/data/v2/coopBosses";
import type { V2SkillsState } from "../src/adventure/data/v2/v2Skills";
import {
  resolveBattle,
  setBattleLogCollection,
  type PlayerCombat,
} from "../src/adventure/v2/combat/engine";
import { pickAutoAction } from "../src/adventure/v2/combat/pickAutoAction";
import {
  buildLevelDesignProgressionSnapshot,
  LEVEL_DESIGN_ARCHETYPES,
  type LevelDesignArchetype,
} from "./sim-v2-level-design";

const DEFAULT_TRIALS = 200;
const DEFAULT_SEED = 20260809;
const HARD_BOSS_DEPTH = 78;
const HARD_BOSS_CAREER_WINS = 500_000;
const HARD_BOSS_ENHANCE_LEVEL = 12;

export type CoopBossTrialAudit = {
  survived: boolean;
  playerHpRatio: number;
  damageDealt: number;
  contributionRatio: number;
};

export type CoopBossBuildAudit = {
  arch: LevelDesignArchetype;
  survivalRatePct: number;
  medianPlayerHpRatio: number;
  medianContributionRatio: number;
  p95ContributionRatio: number;
};

export type CoopBossAudit = {
  bossId: CoopBossKindId;
  builds: CoopBossBuildAudit[];
  medianSurvivalRatePct: number;
  medianContributionRatio: number;
  p95ContributionRatio: number;
};

function mulberry32(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let mixed = value;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function hashSeed(...parts: readonly (string | number)[]): number {
  let hash = 2_166_136_261;
  for (const ch of parts.join(":")) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function percentile(values: readonly number[], ratio: number): number {
  if (values.length === 0) throw new Error("percentile requires values");
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor((sorted.length - 1) * ratio)),
  );
  return sorted[index];
}

function assertFinite(label: string, value: number): number {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`);
  return value;
}

function validateTrials(trials: number): number {
  const normalized = Math.floor(trials);
  if (normalized < 1 || normalized > 200) {
    throw new Error("trials must be between 1 and 200");
  }
  return normalized;
}

function parseBossId(value: unknown): CoopBossKindId {
  if (
    typeof value !== "string" ||
    !Object.prototype.hasOwnProperty.call(COOP_BOSSES, value)
  ) {
    throw new Error(`unknown coop boss: ${String(value)}`);
  }
  return value as CoopBossKindId;
}

export function withSeededRandom<T>(seed: number, run: () => T): T {
  const originalRandom = Math.random;
  Math.random = mulberry32(seed);
  try {
    return run();
  } finally {
    Math.random = originalRandom;
  }
}

export function auditCoopBossForPlayer(args: {
  bossId: CoopBossKindId;
  player: PlayerCombat;
  skills: V2SkillsState;
  trials: number;
  seed: number;
}): CoopBossTrialAudit[] {
  const bossId = parseBossId(args.bossId);
  const trials = validateTrials(args.trials);
  const kind = COOP_BOSSES[bossId];
  const { monster } = coopBossForBattle(kind, kind.sharedMaxHp);
  const audits: CoopBossTrialAudit[] = [];

  setBattleLogCollection(false);
  try {
    for (let trial = 0; trial < trials; trial += 1) {
      const result = withSeededRandom(
        hashSeed(args.seed, bossId, trial),
        () =>
          resolveBattle(
            {
              ...args.player,
              hp: args.player.maxHp,
              mp: args.player.maxMp ?? 0,
            },
            monster,
            "CoopBalanceSim",
            {
              pickAction: (state) =>
                pickAutoAction(state, { rules: [], potions: {} }),
              potions: {},
              v2Skills: args.skills,
              isBoss: true,
              maxTurns: COOP_ATTACK_TURNS,
              initialEnemyHp: kind.sharedMaxHp,
            },
          ),
      );
      const damageDealt = Math.max(
        0,
        kind.sharedMaxHp - result.finalState.enemyHp,
      );
      audits.push({
        survived: result.finalState.playerHp > 0,
        playerHpRatio: assertFinite(
          "playerHpRatio",
          result.finalState.playerHp / Math.max(1, args.player.maxHp),
        ),
        damageDealt,
        contributionRatio: assertFinite(
          "contributionRatio",
          damageDealt / kind.sharedMaxHp,
        ),
      });
    }
  } finally {
    setBattleLogCollection(true);
  }
  if (audits.length === 0) throw new Error("coop audit produced no trials");
  return audits;
}

function buildAuditForArch(
  bossId: CoopBossKindId,
  arch: LevelDesignArchetype,
  trials: number,
  seed: number,
): { build: CoopBossBuildAudit; trials: CoopBossTrialAudit[] } {
  const kind = COOP_BOSSES[bossId];
  const hard = kind.difficulty === "hard";
  const snapshot = buildLevelDesignProgressionSnapshot({
    arch,
    depth: hard ? HARD_BOSS_DEPTH : kind.anchorDepth,
    seed,
    ...(hard
      ? {
          careerWins: HARD_BOSS_CAREER_WINS,
          cultivate: true,
          enhanceLevel: HARD_BOSS_ENHANCE_LEVEL,
        }
      : {}),
  });
  const trialAudits = auditCoopBossForPlayer({
    bossId,
    player: snapshot.player,
    skills: snapshot.v2Skills,
    trials,
    seed: hashSeed(seed, bossId, arch),
  });
  const contributions = trialAudits.map((audit) => audit.contributionRatio);
  const survivalRatePct =
    (trialAudits.filter((audit) => audit.survived).length / trialAudits.length) *
    100;
  return {
    build: {
      arch,
      survivalRatePct: assertFinite("survivalRatePct", survivalRatePct),
      medianPlayerHpRatio: assertFinite(
        "medianPlayerHpRatio",
        percentile(
          trialAudits.map((audit) => audit.playerHpRatio),
          0.5,
        ),
      ),
      medianContributionRatio: assertFinite(
        "medianContributionRatio",
        percentile(contributions, 0.5),
      ),
      p95ContributionRatio: assertFinite(
        "p95ContributionRatio",
        percentile(contributions, 0.95),
      ),
    },
    trials: trialAudits,
  };
}

export function buildCoopBossBalanceReport(options: {
  trials?: number;
  seed?: number;
  bossIds?: readonly CoopBossKindId[];
} = {}): CoopBossAudit[] {
  const trials = validateTrials(options.trials ?? DEFAULT_TRIALS);
  const seed = Math.floor(options.seed ?? DEFAULT_SEED);
  const bossIds = (options.bossIds ?? COOP_BOSS_KIND_IDS).map(parseBossId);
  if (bossIds.length === 0) throw new Error("bossIds must not be empty");

  return bossIds.map((bossId) => {
    const audited = LEVEL_DESIGN_ARCHETYPES.map((arch) =>
      buildAuditForArch(bossId, arch, trials, seed),
    );
    const builds = audited.map((entry) => entry.build);
    const allTrials = audited.flatMap((entry) => entry.trials);
    if (builds.length === 0 || allTrials.length === 0) {
      throw new Error(`coop audit produced no builds: ${bossId}`);
    }
    const contributions = allTrials.map((trial) => trial.contributionRatio);
    return {
      bossId,
      builds,
      medianSurvivalRatePct: assertFinite(
        "medianSurvivalRatePct",
        percentile(
          builds.map((build) => build.survivalRatePct),
          0.5,
        ),
      ),
      medianContributionRatio: assertFinite(
        "medianContributionRatio",
        percentile(contributions, 0.5),
      ),
      p95ContributionRatio: assertFinite(
        "p95ContributionRatio",
        percentile(contributions, 0.95),
      ),
    };
  });
}

type CliOptions = { trials: number; seed: number; json: boolean };

function parseCliOptions(argv: readonly string[]): CliOptions {
  let trials = DEFAULT_TRIALS;
  let seed = DEFAULT_SEED;
  let json = false;
  for (const arg of argv) {
    if (arg === "--json") json = true;
    else if (arg.startsWith("--trials=")) trials = Number(arg.slice(9));
    else if (arg.startsWith("--seed=")) seed = Number(arg.slice(7));
    else throw new Error(`unknown option: ${arg}`);
  }
  return {
    trials: validateTrials(trials),
    seed: Math.floor(assertFinite("seed", seed)),
    json,
  };
}

function printReport(report: readonly CoopBossAudit[], options: CliOptions): void {
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log(
    `협동 보스 방어 체계 점검 · ${options.trials}회/계보 · seed ${options.seed}`,
  );
  console.log("보스                 생존 중앙  기여 중앙  기여 p95");
  for (const boss of report) {
    console.log(
      `${COOP_BOSSES[boss.bossId].name.padEnd(18)} ${boss.medianSurvivalRatePct.toFixed(1).padStart(6)}%     ${(boss.medianContributionRatio * 100).toFixed(2).padStart(6)}%     ${(boss.p95ContributionRatio * 100).toFixed(2).padStart(6)}%`,
    );
  }
}

function main(): void {
  const options = parseCliOptions(process.argv.slice(2));
  printReport(
    buildCoopBossBalanceReport({ trials: options.trials, seed: options.seed }),
    options,
  );
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    main();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
