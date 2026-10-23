// 미개척지 보스 고유 장비 18종의 효과를 같은 슬롯 개척자 장비·효과를 뺀 같은 장비와 비교한다.
// 실행: npx tsx scripts/sim-v2-unexplored-boss-uniques.ts [--trials 5] [--seed 20261024] [--json]
import { pathToFileURL } from "node:url";
import type { Monster } from "../src/adventure/data/monsters/types";
import { V2_EQUIPMENT, type V2EquipSlot, type V2EquipmentId } from "../src/adventure/data/v2/v2Equipment";
import { UNEXPLORED_BOSSES } from "../src/adventure/data/v2/unexploredBosses";
import { resolveBattleAtb } from "../src/adventure/v2/combat/engine.atb";
import { pickAutoAction } from "../src/adventure/v2/combat/pickAutoAction";
import { buildLevelDesignProgressionSnapshot, type LevelDesignArchetype } from "./sim-v2-level-design";
import {
  SPECIALTY_LOADOUTS,
  SPECIALTY_PVE_SCENARIOS,
  hashSeed,
  withSeededRandom,
  type SpecialtyEquipmentLoadout,
  type SpecialtyScenarioId,
} from "./sim-v2-unexplored-specialty-sets";

export type BossUniqueRole = "offense" | "defense";

type ItemPlan = {
  arch: LevelDesignArchetype;
  role: BossUniqueRole;
  scenarios: readonly ScenarioId[];
};

type ScenarioId = SpecialtyScenarioId | "lethal_physical" | "lethal_magic";

// 기존 특화 세트 생존 시나리오는 엔드게임 캐릭터가 죽지 않아 사망 직전 효과(영겁 등)를 재지 못한다.
// 실제로 쓰러질 수 있는 압박을 더해 생존 시간 차이를 본다.
const LETHAL_SCENARIOS = [
  {
    id: "lethal_physical" as const,
    maxTurns: 80,
    monster: {
      name: "보스 고유 검증 lethal_physical", tags: ["golem"], hp: 1_000_000_000,
      atk: 3500, def: 180, magicDef: 180, spd: 105, directActionSpd: true, exp: 0, bonusAttackChancePct: 100,
    } satisfies Monster,
  },
  {
    id: "lethal_magic" as const,
    maxTurns: 80,
    monster: {
      name: "보스 고유 검증 lethal_magic", tags: ["golem"], hp: 1_000_000_000,
      atk: 4000, atkType: "magic", def: 180, magicDef: 180, spd: 80, directActionSpd: true, exp: 0, critPct: 20,
      skill: { kind: "curse", name: "침식 압력", perHit: 2, dmgPerStack: 300, threshold: 6, maxStacks: 12, magicDefMitigationFraction: 0.2, damageTakenPctPerStack: 2, maxDamageTakenPct: 20 },
    } satisfies Monster,
  },
];

const OFFENSE: readonly ScenarioId[] = ["long_dummy", "armored"];
const UNDER_FIRE: readonly ScenarioId[] = ["physical_flurry"];
const DEFENSE: readonly ScenarioId[] = ["lethal_physical", "lethal_magic"];

const PIONEER_BY_ARCH: Partial<Record<LevelDesignArchetype, SpecialtyEquipmentLoadout>> = {
  DEX: SPECIALTY_LOADOUTS.tracking.pioneer,
  LUK: SPECIALTY_LOADOUTS.toxic_blood.pioneer,
  VIT: SPECIALTY_LOADOUTS.glacial_guard.pioneer,
  INT: SPECIALTY_LOADOUTS.deep_arcane.pioneer,
};

export const BOSS_UNIQUE_PLANS: Record<string, ItemPlan> = {
  v2_unexplored_tracking_blade_dagger: { arch: "DEX", role: "offense", scenarios: OFFENSE },
  v2_unexplored_phantom_acceleration_boots: { arch: "DEX", role: "offense", scenarios: UNDER_FIRE },
  v2_unexplored_infinite_orbit_heart: { arch: "DEX", role: "offense", scenarios: OFFENSE },
  v2_unexplored_toxic_blood_claw: { arch: "LUK", role: "offense", scenarios: OFFENSE },
  v2_unexplored_coagulated_venom_ring: { arch: "LUK", role: "offense", scenarios: UNDER_FIRE },
  v2_unexplored_uncorrupted_heart: { arch: "LUK", role: "defense", scenarios: DEFENSE },
  v2_unexplored_glacial_crushing_hammer: { arch: "VIT", role: "defense", scenarios: DEFENSE },
  v2_unexplored_frozen_great_armor: { arch: "VIT", role: "defense", scenarios: DEFENSE },
  v2_unexplored_absolute_zero_core: { arch: "VIT", role: "defense", scenarios: DEFENSE },
  v2_unexplored_magisteel_guard_gauntlets: { arch: "VIT", role: "defense", scenarios: DEFENSE },
  v2_unexplored_sealing_barrier_ring: { arch: "VIT", role: "defense", scenarios: DEFENSE },
  v2_unexplored_invincible_fortress_armor: { arch: "VIT", role: "defense", scenarios: DEFENSE },
  v2_unexplored_prismatic_firing_gauntlets: { arch: "DEX", role: "offense", scenarios: OFFENSE },
  v2_unexplored_starpath_aiming_ring: { arch: "DEX", role: "offense", scenarios: OFFENSE },
  v2_unexplored_infinite_focus_crystal_eye: { arch: "DEX", role: "offense", scenarios: OFFENSE },
  v2_unexplored_immortal_king_greatsword: { arch: "VIT", role: "offense", scenarios: UNDER_FIRE },
  v2_unexplored_pulsing_berserker_gauntlets: { arch: "VIT", role: "defense", scenarios: DEFENSE },
  v2_unexplored_eternal_life_core: { arch: "VIT", role: "defense", scenarios: DEFENSE },
};

export type BossUniqueComparison = {
  itemId: V2EquipmentId;
  name: string;
  chancePct: number;
  arch: LevelDesignArchetype;
  role: BossUniqueRole;
  baselineId: V2EquipmentId;
  score: number;
  baselineScore: number;
  noEffectScore: number;
  /** 같은 슬롯 개척자 장비 대비. */
  ratioVsBaseline: number;
  /** 효과를 뺀 같은 장비 대비(효과 자체의 기여). */
  effectGain: number;
};

function scenarioScore(args: {
  equipment: SpecialtyEquipmentLoadout;
  arch: LevelDesignArchetype;
  role: BossUniqueRole;
  scenarioIds: readonly ScenarioId[];
  stripBossEffects: boolean;
  trials: number;
  seed: number;
}): number {
  const snapshot = buildLevelDesignProgressionSnapshot({
    arch: args.arch, depth: 84, careerWins: 500_000, cultivate: true, seed: args.seed, equipment: args.equipment,
  });
  const maxMp = Math.max(0, snapshot.player.maxMp ?? snapshot.player.mp ?? 0);
  const player = {
    ...snapshot.player,
    hp: snapshot.player.maxHp,
    mp: maxMp,
    ...(args.stripBossEffects ? { unexploredBossEffects: [] } : {}),
  };
  const perScenario = args.scenarioIds.map((id) => {
    const scenario = [...SPECIALTY_PVE_SCENARIOS, ...LETHAL_SCENARIOS].find((candidate) => candidate.id === id)!;
    const values: number[] = [];
    for (let trial = 0; trial < args.trials; trial += 1) {
      const result = withSeededRandom(hashSeed(args.seed, args.arch, id, trial), () =>
        resolveBattleAtb(player, scenario.monster, "보스 고유 비교", {
          pickAction: (state) => pickAutoAction(state, { rules: [], potions: {} }),
          potions: {},
          v2Skills: snapshot.v2Skills,
          forceAtbSkills: true,
          maxTurns: scenario.maxTurns,
        }));
      const ticks = Math.max(1, ...result.finalState.log.map((entry) => entry.t ?? 0));
      if (args.role === "offense") {
        values.push((Math.max(0, scenario.monster.hp - result.finalState.enemyHp) / ticks) * 1_000);
      } else {
        values.push(ticks * (1 + Math.max(0, result.finalState.playerHp) / snapshot.player.maxHp));
      }
    }
    // 생존 점수는 "쓰러짐/버팀"으로 갈리는 이분 분포라 중앙값이 한쪽에 몰린다. 평균으로 본다.
    return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  });
  return perScenario.reduce((sum, value) => sum + value, 0) / Math.max(1, perScenario.length);
}

export function buildBossUniqueBalanceReport(options?: { trials?: number; seed?: number }): BossUniqueComparison[] {
  const trials = Math.max(1, Math.floor(options?.trials ?? 3));
  const seed = Math.floor(options?.seed ?? 20261024);
  return Object.values(UNEXPLORED_BOSSES).flatMap((boss) => boss.uniqueDrops.map((drop) => {
    const plan = BOSS_UNIQUE_PLANS[drop.equipmentId];
    const base = PIONEER_BY_ARCH[plan.arch]!;
    const slot = V2_EQUIPMENT[drop.equipmentId].slot as V2EquipSlot;
    const equipment = { ...base, [slot]: drop.equipmentId };
    const common = { arch: plan.arch, role: plan.role, scenarioIds: plan.scenarios, trials, seed };
    const score = scenarioScore({ ...common, equipment, stripBossEffects: false });
    const noEffectScore = scenarioScore({ ...common, equipment, stripBossEffects: true });
    const baselineScore = scenarioScore({ ...common, equipment: base, stripBossEffects: false });
    return {
      itemId: drop.equipmentId,
      name: drop.equipmentName,
      chancePct: drop.chancePct,
      arch: plan.arch,
      role: plan.role,
      baselineId: base[slot],
      score,
      baselineScore,
      noEffectScore,
      ratioVsBaseline: baselineScore > 0 ? score / baselineScore : 0,
      effectGain: noEffectScore > 0 ? score / noEffectScore : 0,
    };
  }));
}

function cliInteger(args: readonly string[], flag: string, fallback: number): number {
  const index = args.indexOf(flag);
  const value = index >= 0 ? Number(args[index + 1]) : fallback;
  return Number.isFinite(value) ? Math.floor(value) : fallback;
}

export function main(args: readonly string[] = process.argv.slice(2)): void {
  const report = buildBossUniqueBalanceReport({
    trials: cliInteger(args, "--trials", 5),
    seed: cliInteger(args, "--seed", 20261024),
  });
  if (args.includes("--json")) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  for (const row of report) {
    console.log(
      `${row.name.padEnd(12)} ${String(row.chancePct).padStart(4)}% ${row.arch} ${row.role.padEnd(7)} ` +
      `개척자 대비 ${row.ratioVsBaseline.toFixed(3)} · 효과 기여 ${row.effectGain.toFixed(3)}`,
    );
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (invokedPath === import.meta.url) main();
