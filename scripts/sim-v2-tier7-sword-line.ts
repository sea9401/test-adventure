// 검성 계열 7차 결정적 밸런스 시뮬레이션.
// 실행: NODE_PATH=./scripts/server-only-stub NEXT_PUBLIC_V2_CORE_LOOP_V2=true NEXT_PUBLIC_V2_SKILL_PROC_IN_PATTERN=true node --import tsx scripts/sim-v2-tier7-sword-line.ts

import {
  V2_ATB_SKILLS,
  V2_SKILL_PROC_IN_PATTERN,
} from "../src/adventure/data/v2/coreLoopConfig";
import type { Monster } from "../src/adventure/data/monsters/types";
import type { V2StatKey } from "../src/adventure/data/v2/v2StatKeys";
import { V2_JOB_CATALOG } from "../src/adventure/data/v2/v2JobCatalog";
import { V2_SKILLS_BY_JOB } from "../src/adventure/data/v2/v2SkillsByJob";
import { V2_STAT_POINTS_PER_LEVEL } from "../src/adventure/data/v2/v2Stats";
import {
  aggregateEquippedPassives,
  emptyV2SkillsState,
  type V2SkillId,
  type V2SkillsState,
} from "../src/adventure/data/v2/v2Skills";
import type {
  BattleLogEntry,
  PlayerCombat,
} from "../src/adventure/v2/combat/engine";
import { resolveBattleAtb } from "../src/adventure/v2/combat/engine.atb";
import { resolveBattlePvPAtb } from "../src/adventure/v2/combat/engine.pvp-atb";
import { derivePlayerCombatV2Pure } from "../src/lib/server/derivePlayerCombatV2";

export type Tier7SwordLineBuildId =
  | "swordsaint-core"
  | "shadowblade-core"
  | "shadowblade-inherited"
  | "ruinblade-core"
  | "ruinblade-inherited";

export type Tier7SwordLineDistribution = {
  samples: number[];
  mean: number;
  median: number;
  p10: number;
  p90: number;
  maxSingleHit: number;
  firstActionMean?: number;
  firstActionKoRate?: number;
};

export type Tier7SwordLineCaseReport = {
  id: Tier7SwordLineBuildId;
  label: string;
  pveShort: Tier7SwordLineDistribution;
  pveLong: Tier7SwordLineDistribution;
  pveLow: Tier7SwordLineDistribution;
  pvp: Tier7SwordLineDistribution;
};

export type Tier7SwordLineBalanceReport = {
  seedBase: number;
  seeds: number;
  cases: Tier7SwordLineCaseReport[];
  ratios: {
    shadowCoreToSwordsaint: number;
    ruinCoreToSwordsaint: number;
    ruinCoreLowToSwordsaint: number;
    shadowInheritedToSwordsaint: number;
    ruinInheritedToSwordsaint: number;
    longTier7Gap: number;
    tier7IdentityGap: number;
  };
  identity: {
    shadowMaxSingleHit: number;
    ruinMaxSingleHit: number;
  };
};

type BuildDefinition = {
  id: Tier7SwordLineBuildId;
  label: string;
  jobId: "swordsaint" | "shadowblade" | "ruinblade";
  main: "str" | "luk";
  skills: readonly V2SkillId[];
};

const LEVEL = 100;
const DEFAULT_SEEDS = 200;
const DEFAULT_SEED_BASE = 20_260_829;
const PVP_FIRST_ACTION_KO_HP = 10_000;

const BUILDS: readonly BuildDefinition[] = [
  {
    id: "swordsaint-core",
    label: "검성 고유 33 SP",
    jobId: "swordsaint",
    main: "str",
    skills: V2_SKILLS_BY_JOB.swordsaint,
  },
  {
    id: "shadowblade-core",
    label: "무영검신 고유 46 SP",
    jobId: "shadowblade",
    main: "luk",
    skills: V2_SKILLS_BY_JOB.shadowblade,
  },
  {
    id: "shadowblade-inherited",
    label: "무영검신 계승 79 SP",
    jobId: "shadowblade",
    main: "luk",
    skills: [
      ...V2_SKILLS_BY_JOB.shadowblade,
      ...V2_SKILLS_BY_JOB.swordsaint,
    ],
  },
  {
    id: "ruinblade-core",
    label: "멸검제 고유 46 SP",
    jobId: "ruinblade",
    main: "str",
    skills: V2_SKILLS_BY_JOB.ruinblade,
  },
  {
    id: "ruinblade-inherited",
    label: "멸검제 계승 79 SP",
    jobId: "ruinblade",
    main: "str",
    skills: [
      ...V2_SKILLS_BY_JOB.ruinblade,
      ...V2_SKILLS_BY_JOB.swordsaint,
    ],
  },
] as const;

const DUMMY: Monster = {
  name: "결정적 측정 허수아비",
  tags: ["golem"],
  hp: 1_000_000_000,
  atk: 0,
  def: 60,
  magicDef: 60,
  spd: 30,
  directActionSpd: true,
  exp: 0,
};

function allocatedStats(main: "str" | "luk"): Record<V2StatKey, number> {
  const total = (LEVEL - 1) * V2_STAT_POINTS_PER_LEVEL;
  const stats: Record<V2StatKey, number> = {
    str: 0,
    dex: 0,
    vit: 0,
    int: 0,
    spi: 0,
    luk: 0,
  };
  stats[main] = Math.round(total * 0.6);
  stats.dex = main === "luk" ? Math.round(total * 0.3) : 0;
  stats.vit = Math.round(total * (main === "str" ? 0.3 : 0.1));
  if (main === "str") stats.luk = total - stats.str - stats.vit;
  else stats.vit = total - stats.luk - stats.dex;
  return stats;
}

function skillState(skills: readonly V2SkillId[]): V2SkillsState {
  return {
    ...emptyV2SkillsState(),
    learned: [...skills],
    equipped: [...skills],
  };
}

function buildPlayer(build: BuildDefinition): PlayerCombat {
  const passive = aggregateEquippedPassives(build.skills);
  const jobBonus: Partial<Record<V2StatKey, number>> = {
    ...passive.stat,
  };
  for (const [key, value] of Object.entries(
    V2_JOB_CATALOG[build.jobId].jobBonus ?? {},
  )) {
    const stat = key as V2StatKey;
    jobBonus[stat] = (jobBonus[stat] ?? 0) + (value ?? 0);
  }
  const derived = derivePlayerCombatV2Pure({
    level: LEVEL,
    allocatedStats: allocatedStats(build.main),
    v2Equipped: {},
    playerClass: "warrior",
    classTier: 1,
    jobBonus,
    statPct: passive.statPct,
    maxHpPct: passive.maxHpPct,
    maxMpPct: passive.maxMpPct,
    atkPerDexCoef: passive.atkPerDexCoef,
    atkPerLukCoef: passive.atkPerLukCoef,
    passiveCritPct: passive.critPct,
    passiveCritDmgPct: passive.critDmgPct,
    passiveEvasionPct: passive.evasionPct,
    passiveLifestealPct: passive.lifestealPct,
    passiveCounterChancePct: passive.counterChancePct,
    passiveCounterDamageUsesReflectBoost:
      passive.counterDamageUsesReflectBoost,
    passiveDefPct: passive.defPct,
    passiveThornsDefPct: passive.thornsDefPct,
    passiveAccuracyPct: passive.accuracyPct,
    passiveHealPowerPct: passive.healPowerPct,
    passiveDamageTakenReductionPct: passive.damageTakenReductionPct,
    passiveStatusDamageReductionPct: passive.statusDamageReductionPct,
    passiveBleedPhysicalSkillDamagePctPerStack:
      passive.bleedPhysicalSkillDamagePctPerStack,
    passiveMagicDefPct: passive.magicDefPct,
    passiveOpeningMagicDamageReductionPct:
      passive.openingMagicDamageReductionPct,
    passiveOpeningMagicDamageReductionPhases:
      passive.openingMagicDamageReductionPhases,
    passivePoisonedEnemyDefReductionPct:
      passive.poisonedEnemyDefReductionPct,
    passiveBerserkAtkPctPerLostHpPct: passive.berserkAtkPctPerLostHpPct,
    passiveEnemyMagicVulnPctPerStack:
      passive.enemyMagicVulnPctPerStack,
    passiveEnemyMagicVulnApplyChancePct:
      passive.enemyMagicVulnApplyChancePct,
    passiveMagicSkillDamagePct: passive.magicSkillDamagePct,
    passiveSingleHitPhysicalSkillDamagePct:
      passive.singleHitPhysicalSkillDamagePct,
    passiveSpdToAtkMaxPct: passive.spdToAtkMaxPct,
    passiveSpdPerLukCoef: passive.spdPerLukCoef,
    passiveSkillCritOverflow: passive.skillCritOverflow,
    passiveSkillCritDmgPct: passive.skillCritDmgPct,
    passiveSkillCritAfterEvade: passive.skillCritAfterEvade,
    passiveComboFinisherBonusPct: passive.comboFinisherBonusPct,
    hp: undefined,
  });
  return {
    ...derived.player,
    hp: derived.maxHp,
    maxMp: 100_000,
    mp: 100_000,
    spd: 100,
    characterElement: "neutral",
  };
}

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

function stringHash(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function withSeed<T>(seed: number, run: () => T): T {
  const original = Math.random;
  Math.random = mulberry32(seed);
  try {
    return run();
  } finally {
    Math.random = original;
  }
}

function damageValues(log: readonly BattleLogEntry[], side?: "p1"): number[] {
  const values: number[] = [];
  for (const entry of log) {
    if (side && entry.side !== side) continue;
    if (entry.kind === "hp_bar" || entry.kind === "turn_marker") continue;
    for (const match of entry.text.matchAll(/([0-9][0-9,]*) (?:추가 )?피해/g)) {
      values.push(Number(match[1].replaceAll(",", "")));
    }
  }
  return values;
}

function distribution(
  samples: number[],
  hits: number[],
  firstActions?: number[],
): Tier7SwordLineDistribution {
  const sorted = [...samples].sort((a, b) => a - b);
  const quantile = (ratio: number) =>
    sorted[Math.floor((sorted.length - 1) * ratio)] ?? 0;
  const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  const result: Tier7SwordLineDistribution = {
    samples,
    mean,
    median: quantile(0.5),
    p10: quantile(0.1),
    p90: quantile(0.9),
    maxSingleHit: Math.max(0, ...hits),
  };
  if (firstActions) {
    result.firstActionMean =
      firstActions.reduce((sum, value) => sum + value, 0) /
      firstActions.length;
    result.firstActionKoRate =
      firstActions.filter((value) => value >= PVP_FIRST_ACTION_KO_HP).length /
      firstActions.length;
  }
  return result;
}

function runPve(
  build: BuildDefinition,
  seeds: number,
  seedBase: number,
  scenario: "short" | "long" | "low",
): Tier7SwordLineDistribution {
  const samples: number[] = [];
  const hits: number[] = [];
  const maxTurns = scenario === "short" ? 12 : 80;
  for (let index = 0; index < seeds; index += 1) {
    const player = buildPlayer(build);
    if (scenario === "low") player.hp = Math.floor(player.maxHp * 0.35);
    const result = withSeed(
      (seedBase + index + stringHash(`pve:${scenario}`)) >>> 0,
      () =>
        resolveBattleAtb(player, DUMMY, build.label, {
          pickAction: () => ({ kind: "attack" }),
          potions: {},
          v2Skills: skillState(build.skills),
          forceAtbSkills: true,
          maxTurns,
        }),
    );
    samples.push(DUMMY.hp - result.finalState.enemyHp);
    hits.push(...damageValues(result.finalState.log));
  }
  return distribution(samples, hits);
}

function runPvp(
  build: BuildDefinition,
  seeds: number,
  seedBase: number,
): Tier7SwordLineDistribution {
  const samples: number[] = [];
  const hits: number[] = [];
  const firstActions: number[] = [];
  for (let index = 0; index < seeds; index += 1) {
    const player = buildPlayer(build);
    const defender: PlayerCombat = {
      ...buildPlayer(BUILDS[0]),
      hp: DUMMY.hp,
      maxHp: DUMMY.hp,
      atk: 0,
      spd: 100,
    };
    const result = withSeed(
      (seedBase + index + stringHash("pvp")) >>> 0,
      () =>
        resolveBattlePvPAtb(player, defender, build.label, "동일 방어 표본", {
          pickAction: () => ({ kind: "attack" }),
          potions: { p1: {}, p2: {} },
          initiativeRoll: 0,
          v2Skills: {
            p1: skillState(build.skills),
            p2: emptyV2SkillsState(),
          },
        }),
    );
    samples.push(defender.maxHp - result.finalState.p2.hp);
    const playerHits = damageValues(result.finalState.log, "p1");
    hits.push(...playerHits);
    const firstTick = result.finalState.log.find(
      (entry) => entry.side === "p1" && entry.t != null,
    )?.t;
    firstActions.push(
      firstTick == null
        ? 0
        : damageValues(
            result.finalState.log.filter(
              (entry) => entry.side === "p1" && entry.t === firstTick,
            ),
            "p1",
          ).reduce((sum, value) => sum + value, 0),
    );
  }
  return distribution(samples, hits, firstActions);
}

function ratio(value: number, baseline: number): number {
  return baseline > 0 ? value / baseline : 0;
}

export function runTier7SwordLineBalance(options?: {
  seeds?: number;
  seedBase?: number;
}): Tier7SwordLineBalanceReport {
  if (!V2_ATB_SKILLS || !V2_SKILL_PROC_IN_PATTERN) {
    throw new Error(
      "7차 검성 계열 시뮬레이션은 NEXT_PUBLIC_V2_CORE_LOOP_V2=true와 NEXT_PUBLIC_V2_SKILL_PROC_IN_PATTERN=true가 필요합니다.",
    );
  }
  const seeds = Math.max(1, Math.floor(options?.seeds ?? DEFAULT_SEEDS));
  const seedBase = Math.floor(options?.seedBase ?? DEFAULT_SEED_BASE);
  const cases = BUILDS.map((build) => ({
    id: build.id,
    label: build.label,
    pveShort: runPve(build, seeds, seedBase, "short"),
    pveLong: runPve(build, seeds, seedBase, "long"),
    pveLow: runPve(build, seeds, seedBase, "low"),
    pvp: runPvp(build, seeds, seedBase),
  }));
  const byId = Object.fromEntries(cases.map((entry) => [entry.id, entry])) as Record<
    Tier7SwordLineBuildId,
    Tier7SwordLineCaseReport
  >;
  const baseline = byId["swordsaint-core"].pveLong.mean;
  const lowBaseline = byId["swordsaint-core"].pveLow.mean;
  const shadowLong = byId["shadowblade-core"].pveLong.mean;
  const ruinLong = byId["ruinblade-core"].pveLong.mean;
  const ruinLow = byId["ruinblade-core"].pveLow.mean;
  return {
    seedBase,
    seeds,
    cases,
    ratios: {
      shadowCoreToSwordsaint: ratio(shadowLong, baseline),
      ruinCoreToSwordsaint: ratio(ruinLong, baseline),
      ruinCoreLowToSwordsaint: ratio(ruinLow, lowBaseline),
      shadowInheritedToSwordsaint: ratio(
        byId["shadowblade-inherited"].pveLong.mean,
        baseline,
      ),
      ruinInheritedToSwordsaint: ratio(
        byId["ruinblade-inherited"].pveLong.mean,
        baseline,
      ),
      longTier7Gap:
        Math.abs(shadowLong - ruinLong) / Math.max(shadowLong, ruinLong, 1),
      tier7IdentityGap:
        Math.abs(shadowLong - ruinLow) / Math.max(shadowLong, ruinLow, 1),
    },
    identity: {
      shadowMaxSingleHit: byId["shadowblade-core"].pveLong.maxSingleHit,
      // 멸검의 기본 패턴은 저체력에서 충전되므로 저체력 장기전의 최대 타격으로
      // 준비된 필살기 정체성을 검증한다.
      ruinMaxSingleHit: byId["ruinblade-core"].pveLow.maxSingleHit,
    },
  };
}

function printReport(report: Tier7SwordLineBalanceReport): void {
  console.log(
    `검성 계열 7차 결정적 비교 — ${report.seeds} seeds (base ${report.seedBase})`,
  );
  console.table(
    report.cases.map((entry) => ({
      build: entry.label,
      short: Math.round(entry.pveShort.mean),
      long: Math.round(entry.pveLong.mean),
      low: Math.round(entry.pveLow.mean),
      pvp: Math.round(entry.pvp.mean),
      first: Math.round(entry.pvp.firstActionMean ?? 0),
      firstKo: `${(((entry.pvp.firstActionKoRate ?? 0) * 100)).toFixed(1)}%`,
      maxHit: entry.pveLong.maxSingleHit,
    })),
  );
  console.log(report.ratios);
}

if (process.argv[1]?.endsWith("sim-v2-tier7-sword-line.ts")) {
  printReport(runTier7SwordLineBalance());
}
