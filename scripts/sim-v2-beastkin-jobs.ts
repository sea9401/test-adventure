// 수인 출혈 유지 계보의 결정적 밸런스 sim.
// 실행: node --import tsx scripts/sim-v2-beastkin-jobs.ts

import {
  advanceTurn,
  initialBattleState,
  type PlayerCombat,
} from "../src/adventure/v2/combat/engine";
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
  "beastwarrior",
  "tracker",
  "bloodtracker",
  "predator",
  "primalpredator",
] as const;
type BeastkinJobId = (typeof LINE)[number];
type BuildVariant = "portable" | "lineage";

const LEVEL_BY_TIER = { 2: 50, 3: 75, 4: 100, 5: 125, 6: 150 } as const;

export type BeastkinBalanceCase = {
  jobId: BeastkinJobId;
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
  bleed5UptimePct: number;
  bleed10UptimePct: number;
};

export type BeastkinBalanceReport = {
  seed: number;
  trials: number;
  cases: BeastkinBalanceCase[];
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
    str: Math.round(total * 0.6),
    dex: Math.round(total * 0.3),
    vit: Math.round(total * 0.1),
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

function lineageSkills(jobId: BeastkinJobId): V2SkillId[] {
  const end = LINE.indexOf(jobId);
  return [
    ...(V2_SKILLS_BY_JOB.beastkin ?? []),
    ...LINE.slice(0, end + 1).flatMap(
      (lineJobId) => V2_SKILLS_BY_JOB[lineJobId] ?? [],
    ),
  ];
}

function skillsState(ids: readonly V2SkillId[]): V2SkillsState {
  return { learned: [...ids], equipped: [...ids] };
}

function buildPlayer(
  jobId: BeastkinJobId,
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
  return {
    ...derived,
    // 휴대형 스킬의 이식 성능도 재려면 공통 출혈원이 필요하다. 모든 비교 빌드에 동일한
    // 1스택 직접 적중 출혈을 주며, 보고된 가동률은 이 통제 조건 아래의 실측값이다.
    bleedOnHit: { flatPerStack: 0, atkCoefPerStack: 0.45 },
  };
}

function derivePlayerCombat({
  jobId,
  level,
  tier,
  passive,
}: {
  jobId: BeastkinJobId;
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
    hp: Math.max(8_000, Math.floor(player.atk * (70 + tier * 5))),
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
  bleed5Samples: number;
  bleed10Samples: number;
} {
  const monster = longFightMonster(player, tier);
  let state = initialBattleState(
    { ...player, hp: player.maxHp, mp: player.maxMp },
    monster,
    "Sim",
    skillsState(skillIds),
  );
  let actions = 0;
  let healing = 0;
  let bleed5Samples = 0;
  let bleed10Samples = 0;
  for (let step = 0; step < 1_000 && state.phase !== "ended"; step += 1) {
    const playerAction = state.phase === "player";
    if (playerAction) {
      const bleedStacks = state.enemyV2Dots.find(
        (dot) => dot.tag === "bleed" && dot.turns > 0,
      )?.stacks ?? 0;
      actions += 1;
      if (bleedStacks >= 5) bleed5Samples += 1;
      if (bleedStacks >= 10) bleed10Samples += 1;
    }
    const beforeHp = state.playerHp;
    state = advanceTurn(state, player, "Sim", { kind: "attack" });
    if (playerAction && state.playerHp > beforeHp) {
      healing += state.playerHp - beforeHp;
    }
  }
  return {
    won: state.outcome === "win",
    turns: state.turn.completedPlayerTurns,
    actions,
    damage: monster.hp - state.enemyHp,
    healing,
    bleed5Samples,
    bleed10Samples,
  };
}

export function runBeastkinBalance(
  seed = 20_260_820,
  trials = 12,
): BeastkinBalanceReport {
  const safeTrials = Math.max(1, Math.floor(trials));
  const random = mulberry32(seed);
  const originalRandom = Math.random;
  const cases: BeastkinBalanceCase[] = [];
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
        let bleed5Samples = 0;
        let bleed10Samples = 0;
        for (let trial = 0; trial < safeTrials; trial += 1) {
          const battle = runBattle(built, skillIds, tier);
          if (battle.won) wins += 1;
          turns += battle.turns;
          actions += battle.actions;
          damage += battle.damage;
          healing += battle.healing;
          bleed5Samples += battle.bleed5Samples;
          bleed10Samples += battle.bleed10Samples;
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
          bleed5UptimePct: actions > 0 ? (bleed5Samples / actions) * 100 : 0,
          bleed10UptimePct:
            actions > 0 ? (bleed10Samples / actions) * 100 : 0,
        });
      }
    }
  } finally {
    Math.random = originalRandom;
  }
  return { seed, trials: safeTrials, cases };
}

if (process.argv[1]?.endsWith("sim-v2-beastkin-jobs.ts")) {
  const report = runBeastkinBalance();
  console.log(`수인 계보 밸런스 sim — seed=${report.seed}, trials=${report.trials}`);
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
      bleed5: `${entry.bleed5UptimePct.toFixed(1)}%`,
      bleed10: `${entry.bleed10UptimePct.toFixed(1)}%`,
    })),
  );
}
