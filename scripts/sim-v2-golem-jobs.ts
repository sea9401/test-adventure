// 골렘 중량 순환 계보의 결정적 밸런스 sim. 점수화 가정(해방 평균 소모 2.4·중량 3 가동률 35%·
// 해방 비율 40%)을 실측과 비교한다.
// 실행: node --import tsx scripts/sim-v2-golem-jobs.ts

import { type PlayerCombat } from "../src/adventure/v2/combat/engine";
import { resolveBattleAtb } from "../src/adventure/v2/combat/engine.atb";
import {
  aggregateEquippedPassives,
  skillPowerScore,
  spCostOf,
  V2_SKILLS,
  type V2SkillId,
  type V2SkillsState,
} from "../src/adventure/data/v2/v2Skills";
import { V2_SKILLS_BY_JOB } from "../src/adventure/data/v2/v2SkillsByJob";
import { V2_JOB_CATALOG } from "../src/adventure/data/v2/v2JobCatalog";
import { V2_STAT_POINTS_PER_LEVEL } from "../src/adventure/data/v2/v2Stats";
import type { V2StatKey } from "../src/adventure/data/v2/v2StatKeys";
import type { Monster } from "../src/adventure/data/monsters";
import { derivePlayerCombatV2Pure } from "../src/lib/server/derivePlayerCombatV2";

const LINE = [
  "rockbrawler",
  "rockgiant",
  "irongolem",
  "mountaingolem",
  "primevalgolem",
] as const;
type GolemJobId = (typeof LINE)[number];
type BuildVariant = "portable" | "lineage";

const LEVEL_BY_TIER = { 2: 50, 3: 75, 4: 100, 5: 125, 6: 150 } as const;

export type GolemBalanceCase = {
  jobId: GolemJobId;
  tier: 2 | 3 | 4 | 5 | 6;
  variant: BuildVariant;
  power: number;
  sp: number;
  powerPerSp: number;
  sameTierMedianPowerPerSp: number;
  winRatePct: number;
  averageTurns: number;
  averageActions: number;
  averageDamage: number;
  averageHealing: number;
  averageConsumed: number;
  fullWeightUptimePct: number;
  releaseSharePct: number;
};

export type GolemBalanceReport = {
  seed: number;
  trials: number;
  cases: GolemBalanceCase[];
};

function mulberry32(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value |= 0;
    value = (value + 0x6d2b79f5) | 0;
    let mixed = Math.imul(value ^ (value >>> 15), 1 | value);
    mixed =
      (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function allocate(level: number): Partial<Record<V2StatKey, number>> {
  const total = Math.max(0, level - 1) * V2_STAT_POINTS_PER_LEVEL;
  return {
    vit: Math.round(total * 0.6),
    str: Math.round(total * 0.3),
    dex: Math.round(total * 0.1),
  };
}

function packageScore(skillIds: readonly V2SkillId[]): {
  power: number;
  sp: number;
  powerPerSp: number;
} {
  const power = skillIds.reduce(
    (sum, skillId) => sum + skillPowerScore(V2_SKILLS[skillId]),
    0,
  );
  const sp = skillIds.reduce(
    (sum, skillId) => sum + spCostOf(V2_SKILLS[skillId]),
    0,
  );
  return { power, sp, powerPerSp: sp > 0 ? power / sp : 0 };
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? 0);
}

function sameTierMedianPowerPerSp(tier: number): number {
  return median(
    Object.values(V2_JOB_CATALOG)
      .filter((job) => job.tier === tier)
      .flatMap((job) => {
        const ids = V2_SKILLS_BY_JOB[job.id] ?? [];
        if (ids.length === 0) return [];
        const score = packageScore(ids);
        return score.sp > 0 ? [score.powerPerSp] : [];
      }),
  );
}

// 같은 우선순위 기본 패턴은 장착 순서를 따르므로, 현재 직업 스킬을 앞에 두고 아래 차수로 내려간다.
function lineageSkills(jobId: GolemJobId): V2SkillId[] {
  const end = LINE.indexOf(jobId);
  return [
    ...LINE.slice(0, end + 1)
      .reverse()
      .flatMap((lineJobId) => V2_SKILLS_BY_JOB[lineJobId] ?? []),
    ...(V2_SKILLS_BY_JOB.golem ?? []),
  ];
}

function skillsState(ids: readonly V2SkillId[]): V2SkillsState {
  return { learned: [...ids], equipped: [...ids] };
}

function buildPlayer(
  jobId: GolemJobId,
  tier: 2 | 3 | 4 | 5 | 6,
  skillIds: readonly V2SkillId[],
): PlayerCombat {
  const level = LEVEL_BY_TIER[tier];
  const passive = aggregateEquippedPassives(skillIds);
  const derived = derivePlayerCombat({
    jobId,
    level,
    tier,
    passive,
  });
  // 중량 순환 가정(소모량·가동률·해방 비율)을 재려면 MP 고갈 없이 스킬 회전이 이어져야 한다.
  // 모든 비교 빌드에 같은 무제한 MP 통제 조건을 준다.
  return { ...derived, mp: 99_999, maxMp: 99_999 };
}

function derivePlayerCombat({
  jobId,
  level,
  tier,
  passive,
}: {
  jobId: GolemJobId;
  level: number;
  tier: number;
  passive: ReturnType<typeof aggregateEquippedPassives>;
}): PlayerCombat {
  return derivePlayerCombatV2Pure({
    level,
    allocatedStats: allocate(level),
    v2Equipped: {},
    playerClass: "mutant",
    classTier: tier,
    jobBonus: V2_JOB_CATALOG[jobId].jobBonus,
    statPct: passive.statPct,
    maxHpPct: passive.maxHpPct,
    maxMpPct: passive.maxMpPct,
    atkPerDexCoef: passive.atkPerDexCoef,
    passiveCritPct: passive.critPct,
    passiveCritDmgPct: passive.critDmgPct,
    passiveEvasionPct: passive.evasionPct,
    passiveLifestealPct: passive.lifestealPct,
    passiveCounterChancePct: passive.counterChancePct,
    passiveDefPct: passive.defPct,
    passiveThornsDefPct: passive.thornsDefPct,
    passiveAccuracyPct: passive.accuracyPct,
    passiveHealPowerPct: passive.healPowerPct,
    passiveDamageTakenReductionPct: passive.damageTakenReductionPct,
  }).player;
}

function longFightMonster(player: PlayerCombat, tier: number): Monster {
  return {
    name: `장기전 허수아비 ${tier}차`,
    tags: ["beast"],
    hp: Math.max(4_000, Math.floor(player.atk * (40 + tier * 5))),
    atk: Math.max(1, Math.floor(player.def * 0.35)),
    def: Math.max(1, Math.floor(player.atk * 0.3)),
    spd: Math.max(1, Math.floor(player.spd * 0.75)),
    exp: 0,
    evasionPct: 0,
  };
}

function runBattle(
  player: PlayerCombat,
  skillIds: readonly V2SkillId[],
  tier: number,
): {
  won: boolean;
  turns: number;
  actions: number;
  damage: number;
  healing: number;
  fullWeightSamples: number;
  skillCasts: number;
  releases: number;
  consumed: number;
} {
  const monster = longFightMonster(player, tier);
  const result = resolveBattleAtb(
    { ...player, hp: player.maxHp, mp: player.maxMp },
    monster,
    "Sim",
    {
      pickAction: () => ({ kind: "attack" }),
      potions: {},
      v2Skills: skillsState(skillIds),
      forceAtbSkills: true,
      maxTurns: 300,
    },
  );
  const state = result.finalState;
  // 로그로 중량을 재구성해 각 플레이어 스킬 시전 직전 중량을 표본으로 삼는다.
  let weight = 0;
  let fullWeightSamples = 0;
  let skillCasts = 0;
  let releases = 0;
  let consumed = 0;
  let actions = 0;
  for (const entry of state.log) {
    if (entry.turn === "player" && entry.kind === "player_attack") actions += 1;
    if ("skillCast" in entry && entry.skillCast && entry.turn === "player") {
      skillCasts += 1;
      if (weight >= 3) fullWeightSamples += 1;
    }
    const gained = /^\[(?:중량|산맥의 몸)\] (?:중량 )?\+\d \((\d)\/3\)$/.exec(entry.text);
    if (gained) weight = Number(gained[1]);
    const spent = /^\[[^\]]+\] 중량 (\d) 소모$/.exec(entry.text);
    if (spent) {
      releases += 1;
      consumed += Number(spent[1]);
      weight = 0;
    }
  }
  // 스킬 회복 로그 표기("HP N 회복했다")를 합산한다.
  const healing = state.log.reduce((sum, entry) => {
    const heal = entry.turn === "player" ? /HP (\d+) 회복했다/.exec(entry.text) : null;
    return sum + (heal ? Number(heal[1]) : 0);
  }, 0);
  return {
    won: state.outcome === "win",
    turns: state.turn.completedPlayerTurns,
    actions: actions + skillCasts,
    damage: monster.hp - state.enemyHp,
    healing,
    fullWeightSamples,
    skillCasts,
    releases,
    consumed,
  };
}

export function runGolemBalance(
  seed = 20_261_010,
  trials = 12,
): GolemBalanceReport {
  const safeTrials = Math.max(1, Math.floor(trials));
  const random = mulberry32(seed);
  const originalRandom = Math.random;
  const cases: GolemBalanceCase[] = [];
  Math.random = random;
  try {
    for (const jobId of LINE) {
      const tier = V2_JOB_CATALOG[jobId].tier as 2 | 3 | 4 | 5 | 6;
      for (const variant of ["portable", "lineage"] as const) {
        const skillIds =
          variant === "portable"
            ? [...(V2_SKILLS_BY_JOB[jobId] ?? [])]
            : lineageSkills(jobId);
        const score = packageScore(skillIds);
        const built = buildPlayer(jobId, tier, skillIds);
        let wins = 0;
        let turns = 0;
        let actions = 0;
        let damage = 0;
        let healing = 0;
        let fullWeightSamples = 0;
        let skillCasts = 0;
        let releases = 0;
        let consumed = 0;
        for (let trial = 0; trial < safeTrials; trial += 1) {
          const battle = runBattle(built, skillIds, tier);
          if (battle.won) wins += 1;
          turns += battle.turns;
          actions += battle.actions;
          damage += battle.damage;
          healing += battle.healing;
          fullWeightSamples += battle.fullWeightSamples;
          skillCasts += battle.skillCasts;
          releases += battle.releases;
          consumed += battle.consumed;
        }
        cases.push({
          jobId,
          tier,
          variant,
          ...score,
          sameTierMedianPowerPerSp: sameTierMedianPowerPerSp(tier),
          winRatePct: (wins / safeTrials) * 100,
          averageTurns: turns / safeTrials,
          averageActions: actions / safeTrials,
          averageDamage: damage / safeTrials,
          averageHealing: healing / safeTrials,
          averageConsumed: releases > 0 ? consumed / releases : 0,
          fullWeightUptimePct:
            skillCasts > 0 ? (fullWeightSamples / skillCasts) * 100 : 0,
          releaseSharePct: skillCasts > 0 ? (releases / skillCasts) * 100 : 0,
        });
      }
    }
  } finally {
    Math.random = originalRandom;
  }
  return { seed, trials: safeTrials, cases };
}

if (process.argv[1]?.endsWith("sim-v2-golem-jobs.ts")) {
  const report = runGolemBalance();
  console.log(`골렘 계보 밸런스 sim — seed=${report.seed}, trials=${report.trials}`);
  console.table(
    report.cases.map((entry) => ({
      job: entry.jobId,
      build: entry.variant,
      SP: entry.sp,
      "power/SP": entry.powerPerSp.toFixed(3),
      "tier median": entry.sameTierMedianPowerPerSp.toFixed(3),
      win: `${entry.winRatePct.toFixed(1)}%`,
      turns: entry.averageTurns.toFixed(1),
      actions: entry.averageActions.toFixed(1),
      damage: Math.round(entry.averageDamage),
      healing: Math.round(entry.averageHealing),
      consumed: entry.averageConsumed.toFixed(2),
      full: `${entry.fullWeightUptimePct.toFixed(1)}%`,
      release: `${entry.releaseSharePct.toFixed(1)}%`,
    })),
  );
}
