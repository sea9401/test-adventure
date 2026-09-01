// 새 방어 체계 기준 협동 보스 3,000 ATB 틱 밸런스 점검기.
// 실행:
//   npm run sim:coop-boss
//   npm run sim:coop-boss -- --trials=50 --json

import { pathToFileURL } from "node:url";

import {
  COOP_ATTACK_TURNS,
  COOP_BOSSES,
  STANDARD_COOP_BOSS_KIND_IDS,
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
import { initialInvincibleFortressState } from "../src/adventure/v2/combat/invincibleFortressMechanic";
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
// 개인 보스의 추적 수치는 사망 뒤에도 유지된다. 한 표본을 연속 공격 30회로 묶어
// 단발 전투가 아니라 실제 세션에서의 발동 빈도와 피해를 측정한다.
const TRACKING_SESSION_ATTACKS_PER_TRIAL = 30;

export type CoopBossTrialAudit = {
  survived: boolean;
  survivalTicks: number;
  playerHpRatio: number;
  damageDealt: number;
  contributionRatio: number;
  trackingCounterCount: number;
  trackingCounterDamageRatioPerTrigger: number;
  toxicExplosionCount: number;
  toxicDamageRatio: number;
  completedPlayerActions: number;
  glacialFreezeCount: number;
  glacialSkippedActionCount: number;
  fortressEnrageTiers: number[];
  fortressBarrierDamageRatios: number[];
  fortressFirstTier4NormalHitRatio: number;
};

export type CoopBossBuildAudit = {
  arch: LevelDesignArchetype;
  survivalRatePct: number;
  medianPlayerHpRatio: number;
  medianSurvivalTicks: number;
  medianContributionRatio: number;
  p95ContributionRatio: number;
  medianTrackingCounterCount: number;
  medianTrackingCounterDamageRatioPerTrigger: number;
  medianToxicExplosionCount: number;
  medianToxicDamageRatio: number;
  medianCompletedPlayerActions: number;
  medianGlacialFreezeCount: number;
  medianGlacialSkippedActionCount: number;
  medianFortressEnrageTier: number;
  medianFortressBarrierDamageRatio: number;
  maxFortressFirstNormalHitRatio: number;
};

export type CoopBossAudit = {
  bossId: CoopBossKindId;
  builds: CoopBossBuildAudit[];
  medianSurvivalRatePct: number;
  medianContributionRatio: number;
  p95ContributionRatio: number;
  medianTrackingCounterCount: number;
  medianTrackingCounterDamageRatioPerTrigger: number;
  medianSurvivalTicks: number;
  medianToxicExplosionCount: number;
  medianToxicDamageRatio: number;
  medianCompletedPlayerActions: number;
  medianGlacialFreezeCount: number;
  medianGlacialSkippedActionCount: number;
  medianFortressEnrageTier: number;
  medianFortressBarrierDamageRatio: number;
  maxFortressFirstNormalHitRatio: number;
};

const FORTRESS_TIER_MIN_DAMAGE_RATIO = [1, 0.75, 0.5, 0.25, 0] as const;

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

  // 보스 전용 기믹은 문자열을 파싱하지 않고 공격 로그의 정형 메타데이터를 행동 묶음에서
  // 읽는다. 해당 보스들만 로그 수집을 유지해 실제 서버 전투와 같은 판정을 쓴다.
  setBattleLogCollection(
    bossId === "tracking_weapon" ||
      bossId === "toxic_blood_lord" ||
      bossId === "glacial_colossus" ||
      bossId === "invincible_fortress",
  );
  try {
    for (let trial = 0; trial < trials; trial += 1) {
      const attempts = bossId === "tracking_weapon"
        ? TRACKING_SESSION_ATTACKS_PER_TRIAL
        : 1;
      let trackingThreat = 0;
      let trackingCounterCount = 0;
      let trackingCounterDamage = 0;
      let toxicExplosionCount = 0;
      let toxicDamageTaken = 0;
      let completedPlayerActions = 0;
      let glacialFreezeCount = 0;
      let glacialSkippedActionCount = 0;
      const fortressEnrageTiers: number[] = [];
      const fortressBarrierDamageRatios: number[] = [];
      let fortressFirstTier4NormalHitRatio = 0;
      let damageDealt = 0;
      let finalPlayerHp = args.player.maxHp;
      let survivalTicks = 0;
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        const result = withSeededRandom(
          hashSeed(args.seed, bossId, trial, attempt),
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
                ...(bossId === "tracking_weapon"
                  ? {
                      bossMechanic: {
                        kind: "tracking_weapon" as const,
                        initialThreat: trackingThreat,
                      },
                    }
                  : bossId === "toxic_blood_lord"
                    ? {
                        bossMechanic: {
                          kind: "toxic_blood_lord" as const,
                        },
                      }
                    : bossId === "glacial_colossus"
                      ? {
                          bossMechanic: {
                            kind: "glacial_colossus" as const,
                          },
                        }
                    : bossId === "invincible_fortress"
                      ? {
                          bossMechanic: {
                            kind: "invincible_fortress" as const,
                            sharedMaxHp: kind.sharedMaxHp,
                            initialState: initialInvincibleFortressState(
                              kind.sharedMaxHp,
                            ),
                          },
                        }
                    : {}),
              },
            ),
        );
        damageDealt += Math.max(
          0,
          kind.sharedMaxHp - result.finalState.enemyHp,
        );
        finalPlayerHp = result.finalState.playerHp;
        completedPlayerActions += result.turns;
        survivalTicks = Math.max(
          survivalTicks,
          ...result.finalState.log.map((entry) => entry.t ?? 0),
        );
        if (result.finalState.bossMechanic?.kind === "tracking_weapon") {
          trackingThreat = result.finalState.bossMechanic.trackingThreat;
          trackingCounterCount +=
            result.finalState.bossMechanic.trackingCounterCount;
          trackingCounterDamage +=
            result.finalState.bossMechanic.trackingCounterDamage;
        }
        if (result.finalState.bossMechanic?.kind === "toxic_blood_lord") {
          toxicExplosionCount +=
            result.finalState.bossMechanic.toxicExplosionCount;
          toxicDamageTaken += result.finalState.bossMechanic.toxicDamageTaken;
        }
        if (result.finalState.bossMechanic?.kind === "glacial_colossus") {
          const glacial = result.finalState.bossMechanic;
          const outstandingFreezes =
            glacial.glacialFreezeCount - glacial.glacialSkippedActionCount;
          if (
            outstandingFreezes !== 0 &&
            !(
              outstandingFreezes === 1 &&
              glacial.glacialFreezePending === 1
            )
          ) {
            throw new Error(
              `invalid glacial freeze accounting: ${glacial.glacialFreezeCount}/${glacial.glacialSkippedActionCount}`,
            );
          }
          glacialFreezeCount += glacial.glacialFreezeCount;
          glacialSkippedActionCount += glacial.glacialSkippedActionCount;
        }
        if (result.finalState.bossMechanic?.kind === "invincible_fortress") {
          const fortress = result.finalState.bossMechanic;
          fortressEnrageTiers.push(...fortress.barrierResults);
          fortressBarrierDamageRatios.push(
            ...fortress.barrierResults.map(
              (tier) => FORTRESS_TIER_MIN_DAMAGE_RATIO[tier],
            ),
          );
          const tier4LogIndex = result.finalState.log.findIndex((entry) =>
            entry.text.includes("광폭 4단계 적용"),
          );
          if (tier4LogIndex >= 0) {
            const firstNormalHit = result.finalState.log
              .slice(tier4LogIndex + 1)
              .find(
                (entry) =>
                  entry.kind === "enemy_attack" &&
                  (entry.enemyHpDamage ?? 0) > 0 &&
                  entry.heavyBlowFired !== true,
              );
            fortressFirstTier4NormalHitRatio = Math.max(
              fortressFirstTier4NormalHitRatio,
              (firstNormalHit?.kind === "enemy_attack"
                ? firstNormalHit.enemyHpDamage ?? 0
                : 0) / Math.max(1, args.player.maxHp),
            );
          }
        }
        if (result.finalState.enemyHp <= 0) break;
      }
      const trackingCounterDamageRatioPerTrigger =
        trackingCounterCount > 0
          ? trackingCounterDamage /
            trackingCounterCount /
            Math.max(1, args.player.maxHp)
          : 0;
      audits.push({
        survived: finalPlayerHp > 0,
        survivalTicks: assertFinite("survivalTicks", survivalTicks),
        playerHpRatio: assertFinite(
          "playerHpRatio",
          finalPlayerHp / Math.max(1, args.player.maxHp),
        ),
        damageDealt,
        contributionRatio: assertFinite(
          "contributionRatio",
          damageDealt / kind.sharedMaxHp,
        ),
        trackingCounterCount,
        trackingCounterDamageRatioPerTrigger: assertFinite(
          "trackingCounterDamageRatioPerTrigger",
          trackingCounterDamageRatioPerTrigger,
        ),
        toxicExplosionCount,
        toxicDamageRatio: assertFinite(
          "toxicDamageRatio",
          toxicDamageTaken / Math.max(1, args.player.maxHp),
        ),
        completedPlayerActions,
        glacialFreezeCount,
        glacialSkippedActionCount,
        fortressEnrageTiers,
        fortressBarrierDamageRatios,
        fortressFirstTier4NormalHitRatio,
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
  const personalEndgame = kind.rewardMode === "unexplored_personal";
  const snapshot = buildLevelDesignProgressionSnapshot({
    arch,
    depth: hard ? HARD_BOSS_DEPTH : kind.anchorDepth,
    seed,
    ...(hard || personalEndgame
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
  const fortressTiers = trialAudits.flatMap(
    (audit) => audit.fortressEnrageTiers,
  );
  const fortressDamageRatios = trialAudits.flatMap(
    (audit) => audit.fortressBarrierDamageRatios,
  );
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
      medianSurvivalTicks: assertFinite(
        "medianSurvivalTicks",
        percentile(
          trialAudits.map((audit) => audit.survivalTicks),
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
      medianTrackingCounterCount: assertFinite(
        "medianTrackingCounterCount",
        percentile(
          trialAudits.map((audit) => audit.trackingCounterCount),
          0.5,
        ),
      ),
      medianTrackingCounterDamageRatioPerTrigger: assertFinite(
        "medianTrackingCounterDamageRatioPerTrigger",
        percentile(
          trialAudits.map(
            (audit) => audit.trackingCounterDamageRatioPerTrigger,
          ),
          0.5,
        ),
      ),
      medianToxicExplosionCount: assertFinite(
        "medianToxicExplosionCount",
        percentile(
          trialAudits.map((audit) => audit.toxicExplosionCount),
          0.5,
        ),
      ),
      medianToxicDamageRatio: assertFinite(
        "medianToxicDamageRatio",
        percentile(
          trialAudits.map((audit) => audit.toxicDamageRatio),
          0.5,
        ),
      ),
      medianCompletedPlayerActions: assertFinite(
        "medianCompletedPlayerActions",
        percentile(
          trialAudits.map((audit) => audit.completedPlayerActions),
          0.5,
        ),
      ),
      medianGlacialFreezeCount: assertFinite(
        "medianGlacialFreezeCount",
        percentile(
          trialAudits.map((audit) => audit.glacialFreezeCount),
          0.5,
        ),
      ),
      medianGlacialSkippedActionCount: assertFinite(
        "medianGlacialSkippedActionCount",
        percentile(
          trialAudits.map((audit) => audit.glacialSkippedActionCount),
          0.5,
        ),
      ),
      medianFortressEnrageTier: assertFinite(
        "medianFortressEnrageTier",
        percentile(fortressTiers.length > 0 ? fortressTiers : [0], 0.5),
      ),
      medianFortressBarrierDamageRatio: assertFinite(
        "medianFortressBarrierDamageRatio",
        percentile(
          fortressDamageRatios.length > 0 ? fortressDamageRatios : [0],
          0.5,
        ),
      ),
      maxFortressFirstNormalHitRatio: assertFinite(
        "maxFortressFirstNormalHitRatio",
        Math.max(
          0,
          ...trialAudits.map(
            (audit) => audit.fortressFirstTier4NormalHitRatio,
          ),
        ),
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
  const bossIds = (options.bossIds ?? STANDARD_COOP_BOSS_KIND_IDS).map(parseBossId);
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
      medianTrackingCounterCount: assertFinite(
        "medianTrackingCounterCount",
        percentile(
          allTrials.map((trial) => trial.trackingCounterCount),
          0.5,
        ),
      ),
      medianTrackingCounterDamageRatioPerTrigger: assertFinite(
        "medianTrackingCounterDamageRatioPerTrigger",
        percentile(
          allTrials.map(
            (trial) => trial.trackingCounterDamageRatioPerTrigger,
          ),
          0.5,
        ),
      ),
      medianSurvivalTicks: assertFinite(
        "medianSurvivalTicks",
        percentile(
          allTrials.map((trial) => trial.survivalTicks),
          0.5,
        ),
      ),
      medianToxicExplosionCount: assertFinite(
        "medianToxicExplosionCount",
        percentile(
          allTrials.map((trial) => trial.toxicExplosionCount),
          0.5,
        ),
      ),
      medianToxicDamageRatio: assertFinite(
        "medianToxicDamageRatio",
        percentile(
          allTrials.map((trial) => trial.toxicDamageRatio),
          0.5,
        ),
      ),
      medianCompletedPlayerActions: assertFinite(
        "medianCompletedPlayerActions",
        percentile(
          allTrials.map((trial) => trial.completedPlayerActions),
          0.5,
        ),
      ),
      medianGlacialFreezeCount: assertFinite(
        "medianGlacialFreezeCount",
        percentile(
          allTrials.map((trial) => trial.glacialFreezeCount),
          0.5,
        ),
      ),
      medianGlacialSkippedActionCount: assertFinite(
        "medianGlacialSkippedActionCount",
        percentile(
          allTrials.map((trial) => trial.glacialSkippedActionCount),
          0.5,
        ),
      ),
      medianFortressEnrageTier: assertFinite(
        "medianFortressEnrageTier",
        percentile(
          allTrials.flatMap((trial) => trial.fortressEnrageTiers).length > 0
            ? allTrials.flatMap((trial) => trial.fortressEnrageTiers)
            : [0],
          0.5,
        ),
      ),
      medianFortressBarrierDamageRatio: assertFinite(
        "medianFortressBarrierDamageRatio",
        percentile(
          allTrials.flatMap((trial) => trial.fortressBarrierDamageRatios).length > 0
            ? allTrials.flatMap((trial) => trial.fortressBarrierDamageRatios)
            : [0],
          0.5,
        ),
      ),
      maxFortressFirstNormalHitRatio: assertFinite(
        "maxFortressFirstNormalHitRatio",
        Math.max(
          0,
          ...allTrials.map(
            (trial) => trial.fortressFirstTier4NormalHitRatio,
          ),
        ),
      ),
    };
  });
}

type CliOptions = {
  trials: number;
  seed: number;
  json: boolean;
  bossIds?: CoopBossKindId[];
};

function parseCliOptions(argv: readonly string[]): CliOptions {
  let trials = DEFAULT_TRIALS;
  let seed = DEFAULT_SEED;
  let json = false;
  let bossIds: CoopBossKindId[] | undefined;
  for (const arg of argv) {
    if (arg === "--json") json = true;
    else if (arg.startsWith("--trials=")) trials = Number(arg.slice(9));
    else if (arg.startsWith("--seed=")) seed = Number(arg.slice(7));
    else if (arg.startsWith("--boss=")) {
      const values = arg.slice(7).split(",").filter(Boolean);
      if (values.length === 0) throw new Error("boss filter must not be empty");
      bossIds = values.map(parseBossId);
    }
    else throw new Error(`unknown option: ${arg}`);
  }
  return {
    trials: validateTrials(trials),
    seed: Math.floor(assertFinite("seed", seed)),
    json,
    bossIds,
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
  console.log(
    "보스                 생존 중앙  기여 중앙  기여 p95  생존 틱  완료 행동  성채 광폭  방벽 달성  최대광폭 첫타/HP",
  );
  for (const boss of report) {
    console.log(
      `${COOP_BOSSES[boss.bossId].name.padEnd(18)} ${boss.medianSurvivalRatePct.toFixed(1).padStart(6)}%     ${(boss.medianContributionRatio * 100).toFixed(2).padStart(6)}%     ${(boss.p95ContributionRatio * 100).toFixed(2).padStart(6)}%     ${boss.medianSurvivalTicks.toFixed(0).padStart(6)}     ${boss.medianCompletedPlayerActions.toFixed(1).padStart(6)}     ${boss.medianFortressEnrageTier.toFixed(1).padStart(6)}     ${(boss.medianFortressBarrierDamageRatio * 100).toFixed(1).padStart(6)}%     ${(boss.maxFortressFirstNormalHitRatio * 100).toFixed(1).padStart(6)}%`,
    );
  }
}

function main(): void {
  const options = parseCliOptions(process.argv.slice(2));
  printReport(
    buildCoopBossBalanceReport({
      trials: options.trials,
      seed: options.seed,
      bossIds: options.bossIds,
    }),
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
