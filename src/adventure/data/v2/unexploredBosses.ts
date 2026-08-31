import type { Monster } from "@/adventure/data/monsters/types";
import type { V2EquipmentId } from "./v2Equipment";
import type { UnexploredPoolId } from "./unexploredMonsterPools";

export const UNEXPLORED_BOSS_CORE_MATERIAL = {
  id: "v2_unexplored_boss_core",
  name: "우두머리 핵",
  description: "미개척지 우두머리에게서 얻는 불안정한 공용 핵. 후속 제작에 쓰이는 거래 재료.",
} as const;

export const UNEXPLORED_SUMMON_STONE_TRACE_COST = 500;
export const UNEXPLORED_SUMMON_STONE_POOL_MATERIAL_COST = 10;
export const UNEXPLORED_SUMMON_STONE_SCROLL_COST = 10;
// 출시 직전 경제 스냅샷에서 1일 자연 회복 순수익의 25%로 교체할 단일 캘리브 다이얼.
export const UNEXPLORED_SUMMON_STONE_GOLD_COST = 1_000_000;

export const UNEXPLORED_SUMMON_STONE_MATERIALS = {
  v2_unexplored_tracking_weapon_summon_stone: {
    id: "v2_unexplored_tracking_weapon_summon_stone",
    name: "추적 병기 소환석",
    description: "폭주 기계와 그림자 추적자의 흔적을 결속한 거래 가능한 개인 보스 소환석.",
  },
  v2_unexplored_toxic_blood_lord_summon_stone: {
    id: "v2_unexplored_toxic_blood_lord_summon_stone",
    name: "독혈 군주 소환석",
    description: "맹독 군락과 혈흔 망자의 흔적을 결속한 거래 가능한 개인 보스 소환석.",
  },
  v2_unexplored_glacial_colossus_summon_stone: {
    id: "v2_unexplored_glacial_colossus_summon_stone",
    name: "빙하 거수 소환석",
    description: "혹한 군단과 파쇄 거수의 흔적을 결속한 거래 가능한 개인 보스 소환석.",
  },
} as const;

export type UnexploredSummonStoneMaterialId =
  keyof typeof UNEXPLORED_SUMMON_STONE_MATERIALS;

export type UnexploredBossUniqueDrop = {
  equipmentId: V2EquipmentId;
  chancePct: 30 | 10 | 0.5;
};

export type UnexploredBossDefinition = {
  id: "tracking_weapon" | "toxic_blood_lord" | "glacial_colossus";
  name: string;
  pools: readonly [UnexploredPoolId, UnexploredPoolId];
  summonMaterialId: UnexploredSummonStoneMaterialId;
  uniqueDrops: readonly [
    UnexploredBossUniqueDrop,
    UnexploredBossUniqueDrop,
    UnexploredBossUniqueDrop,
  ];
  titleId: string;
  sharedMaxHp: number;
  anchorDepth: number;
  monster: Monster;
  traits: readonly string[];
};

export const UNEXPLORED_BOSSES = {
  tracking_weapon: {
    id: "tracking_weapon",
    name: "추적 병기",
    pools: ["runaway_machines", "shadow_stalkers"],
    summonMaterialId: "v2_unexplored_tracking_weapon_summon_stone",
    uniqueDrops: [
      { equipmentId: "v2_unexplored_tracking_blade_dagger", chancePct: 30 },
      { equipmentId: "v2_unexplored_phantom_acceleration_boots", chancePct: 10 },
      { equipmentId: "v2_unexplored_infinite_orbit_heart", chancePct: 0.5 },
    ],
    titleId: "v2_unexplored_tracking_weapon",
    sharedMaxHp: 10_800_000,
    anchorDepth: 120,
    monster: {
      name: "추적 병기",
      tags: ["golem"],
      image: "/images/monster/v2/unexplored-boss-tracking-weapon.webp",
      hp: 1_050,
      atk: 2.2,
      def: 42,
      magicDef: 38,
      spd: 27,
      accuracy: -220,
      evasionPct: 22,
      exp: 0,
      skill: { kind: "pierce", name: "궤도 절단", armorPierce: 18 },
      bonusAttackChancePct: 100,
      armorVulnerable: 0.35,
      playerDefVulnerable: 0.35,
      dropQualityBias: 4,
      v2MaxMp: 0,
    },
    traits: ["빠른 행동", "연속 공격", "높은 회피와 방어 관통"],
  },
  toxic_blood_lord: {
    id: "toxic_blood_lord",
    name: "독혈 군주",
    pools: ["venom_colony", "bloodstained_dead"],
    summonMaterialId: "v2_unexplored_toxic_blood_lord_summon_stone",
    uniqueDrops: [
      { equipmentId: "v2_unexplored_toxic_blood_claw", chancePct: 30 },
      { equipmentId: "v2_unexplored_coagulated_venom_ring", chancePct: 10 },
      { equipmentId: "v2_unexplored_uncorrupted_heart", chancePct: 0.5 },
    ],
    titleId: "v2_unexplored_toxic_blood_lord",
    sharedMaxHp: 10_800_000,
    anchorDepth: 120,
    monster: {
      name: "독혈 군주",
      tags: ["undead", "beast"],
      image: "/images/monster/v2/unexplored-boss-toxic-blood-lord.webp",
      hp: 1_100,
      atk: 2.05,
      def: 40,
      magicDef: 42,
      spd: 23,
      accuracy: -210,
      evasionPct: 12,
      exp: 0,
      skill: { kind: "heavy_blow", name: "독혈 파열", everyPhases: 3, multiplier: 1.8 },
      armorVulnerable: 0.35,
      playerDefVulnerable: 0.35,
      dropQualityBias: 4,
      v2Skills: { learned: ["mob_venom_bite"], equipped: ["mob_venom_bite"] },
      v2MaxMp: 120,
    },
    traits: ["중독 누적", "출혈성 강타", "지속 피해 압박"],
  },
  glacial_colossus: {
    id: "glacial_colossus",
    name: "빙하 거수",
    pools: ["frozen_legion", "crushing_colossi"],
    summonMaterialId: "v2_unexplored_glacial_colossus_summon_stone",
    uniqueDrops: [
      { equipmentId: "v2_unexplored_glacial_crushing_hammer", chancePct: 30 },
      { equipmentId: "v2_unexplored_frozen_great_armor", chancePct: 10 },
      { equipmentId: "v2_unexplored_absolute_zero_core", chancePct: 0.5 },
    ],
    titleId: "v2_unexplored_glacial_colossus",
    sharedMaxHp: 10_800_000,
    anchorDepth: 120,
    monster: {
      name: "빙하 거수",
      tags: ["golem"],
      image: "/images/monster/v2/unexplored-boss-glacial-colossus.webp",
      hp: 1_300,
      atk: 2,
      atkType: "magic",
      def: 48,
      magicDef: 52,
      spd: 19,
      accuracy: -205,
      evasionPct: 8,
      exp: 0,
      skill: {
        kind: "chill",
        name: "절대 한기",
        perHit: 2,
        threshold: 2,
        dmgPerStack: 26,
        maxStacks: 10,
        defMitigationFraction: 0.25,
        evasionPenaltyPerStack: 1.5,
      },
      armorVulnerable: 0.35,
      playerDefVulnerable: 0.35,
      dropQualityBias: 4,
      v2MaxMp: 0,
    },
    traits: ["높은 체력과 방어", "한기 누적", "주기적인 강타"],
  },
} as const satisfies Record<string, UnexploredBossDefinition>;

export type UnexploredBossId = keyof typeof UNEXPLORED_BOSSES;

export const UNEXPLORED_BOSS_IDS = Object.keys(
  UNEXPLORED_BOSSES,
) as UnexploredBossId[];

export function parseUnexploredBossId(value: unknown): UnexploredBossId | null {
  return typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(UNEXPLORED_BOSSES, value)
    ? (value as UnexploredBossId)
    : null;
}
