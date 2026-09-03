import type { Monster } from "@/adventure/data/monsters/types";
import type { V2EquipmentId } from "./v2Equipment";
import {
  UNEXPLORED_POOL_BY_ID,
  type UnexploredPoolId,
} from "./unexploredMonsterPools";

export const UNEXPLORED_BOSS_CORE_MATERIAL = {
  id: "v2_unexplored_boss_core",
  name: "우두머리 핵",
  description: "미개척지 우두머리에게서 얻는 불안정한 공용 핵. 후속 제작에 쓰이는 거래 재료.",
} as const;

export const UNEXPLORED_SUMMON_STONE_TRACE_COST = 500;
export const UNEXPLORED_SUMMON_STONE_POOL_MATERIAL_COST = 10;
export const UNEXPLORED_SUMMON_STONE_SCROLL_COST = 30;
// 2026-08-29 운영 경제 스냅샷: 최상위 안정 파밍 표본의 자연 회복 1일 순가치
// 중앙 25,508,328G × 25% = 6,377,082G를 참고하되, 보스 소환서 소모를 30장으로
// 높이는 운영 결정을 함께 반영해 골드 싱크는 5,000,000G로 낮춰 확정했다.
export const UNEXPLORED_SUMMON_STONE_GOLD_COST = 5_000_000;

// 2026-09-02 테스트 서버 실전 기록: 기존 10,800,000 HP는 상위 캐릭터에게 평균
// 1~4회 공격으로 처치됐다. 기믹을 전개할 여유는 주되 HP만으로 늘어지는 전투를 피하도록
// 공통 체력은 3배로 잡고, 실제 생존 압박은 각 보스의 공격력으로 분담한다.
export const UNEXPLORED_BOSS_SHARED_MAX_HP = 32_400_000;
// 추적 병기·독혈 군주는 1,080만 체력 기준으로 조정한 초반 보스다. 강화된 기믹을
// 확인할 시간만 보태고 후속 보스처럼 장기전이 되지 않도록 별도 체력을 사용한다.
export const UNEXPLORED_EARLY_BOSS_SHARED_MAX_HP = 15_000_000;

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
  v2_unexplored_invincible_fortress_summon_stone: {
    id: "v2_unexplored_invincible_fortress_summon_stone",
    name: "불괴의 성채 소환석",
    description: "철갑 군단과 마력 방벽체의 흔적을 결속한 거래 가능한 개인 보스 소환석.",
  },
  v2_unexplored_skyward_crystal_eye_summon_stone: {
    id: "v2_unexplored_skyward_crystal_eye_summon_stone",
    name: "천공의 수정안 소환석",
    description: "수정 포격대와 정밀 사냥단의 흔적을 결속한 거래 가능한 개인 보스 소환석.",
  },
  v2_unexplored_immortal_berserker_summon_stone: {
    id: "v2_unexplored_immortal_berserker_summon_stone",
    name: "불멸의 광전왕 소환석",
    description: "재생 군체와 붉은 광전대의 흔적을 결속한 거래 가능한 개인 보스 소환석.",
  },
} as const;

export type UnexploredSummonStoneMaterialId =
  keyof typeof UNEXPLORED_SUMMON_STONE_MATERIALS;

export type UnexploredBossUniqueDrop = {
  equipmentId: V2EquipmentId;
  equipmentName: string;
  chancePct: 30 | 10 | 0.5;
};

export type UnexploredBossDefinition = {
  id: string;
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
      {
        equipmentId: "v2_unexplored_tracking_blade_dagger",
        equipmentName: "추적날 단검",
        chancePct: 30,
      },
      {
        equipmentId: "v2_unexplored_phantom_acceleration_boots",
        equipmentName: "허상 가속화",
        chancePct: 10,
      },
      {
        equipmentId: "v2_unexplored_infinite_orbit_heart",
        equipmentName: "무한궤도 심장",
        chancePct: 0.5,
      },
    ],
    titleId: "v2_unexplored_tracking_weapon",
    sharedMaxHp: UNEXPLORED_EARLY_BOSS_SHARED_MAX_HP,
    anchorDepth: 120,
    monster: {
      name: "추적 병기",
      tags: ["golem"],
      image: "/images/monster/v2/unexplored-boss-tracking-weapon.webp",
      hp: 1_050,
      atk: 16,
      def: 42,
      magicDef: 38,
      spd: 52,
      accuracy: -220,
      evasionPct: 12,
      exp: 0,
      skill: { kind: "pierce", name: "궤도 절단", armorPierce: 10 },
      armorVulnerable: 0.35,
      playerDefVulnerable: 0.35,
      dropQualityBias: 4,
      v2Skills: {
        learned: ["mob_crushing_blow"],
        equipped: ["mob_crushing_blow"],
      },
      v2MaxMp: 90,
    },
    traits: [
      "45틱마다 빠른 행동",
      "피해·타격 추적",
      "추적 완료 시 방어 50% 관통·일반 보호막 무시 2연타",
    ],
  },
  toxic_blood_lord: {
    id: "toxic_blood_lord",
    name: "독혈 군주",
    pools: ["venom_colony", "bloodstained_dead"],
    summonMaterialId: "v2_unexplored_toxic_blood_lord_summon_stone",
    uniqueDrops: [
      {
        equipmentId: "v2_unexplored_toxic_blood_claw",
        equipmentName: "독혈 발톱",
        chancePct: 30,
      },
      {
        equipmentId: "v2_unexplored_coagulated_venom_ring",
        equipmentName: "응고독 반지",
        chancePct: 10,
      },
      {
        equipmentId: "v2_unexplored_uncorrupted_heart",
        equipmentName: "부패하지 않는 심장",
        chancePct: 0.5,
      },
    ],
    titleId: "v2_unexplored_toxic_blood_lord",
    sharedMaxHp: UNEXPLORED_EARLY_BOSS_SHARED_MAX_HP,
    anchorDepth: 120,
    monster: {
      name: "독혈 군주",
      tags: ["undead", "beast"],
      image: "/images/monster/v2/unexplored-boss-toxic-blood-lord.webp",
      hp: 1_100,
      atk: 2.05,
      def: 44,
      magicDef: 46,
      spd: 52,
      accuracy: -210,
      evasionPct: 12,
      exp: 0,
      skill: { kind: "heavy_blow", name: "독혈 파열", everyPhases: 3, multiplier: 1.8 },
      armorVulnerable: 0.35,
      playerDefVulnerable: 0.35,
      dropQualityBias: 4,
      v2Skills: {
        learned: ["mob_venom_sunder", "mob_crushing_blow"],
        equipped: ["mob_venom_sunder", "mob_crushing_blow"],
      },
      v2MaxMp: 90,
    },
    traits: [
      "45틱마다 빠른 행동",
      "피격 시 독혈 누적",
      "10중첩 독혈 폭발",
      "중독·폭발 후 회복 억제",
    ],
  },
  glacial_colossus: {
    id: "glacial_colossus",
    name: "빙하 거수",
    pools: ["frozen_legion", "crushing_colossi"],
    summonMaterialId: "v2_unexplored_glacial_colossus_summon_stone",
    uniqueDrops: [
      {
        equipmentId: "v2_unexplored_glacial_crushing_hammer",
        equipmentName: "빙하 파쇄망치",
        chancePct: 30,
      },
      {
        equipmentId: "v2_unexplored_frozen_great_armor",
        equipmentName: "얼어붙은 거갑",
        chancePct: 10,
      },
      {
        equipmentId: "v2_unexplored_absolute_zero_core",
        equipmentName: "절대영도의 핵",
        chancePct: 0.5,
      },
    ],
    titleId: "v2_unexplored_glacial_colossus",
    sharedMaxHp: UNEXPLORED_BOSS_SHARED_MAX_HP,
    anchorDepth: 120,
    monster: {
      name: "빙하 거수",
      tags: ["golem"],
      image: "/images/monster/v2/unexplored-boss-glacial-colossus.webp",
      hp: 1_300,
      atk: 4,
      atkType: "magic",
      def: 48,
      magicDef: 52,
      spd: 19,
      accuracy: -205,
      evasionPct: 8,
      exp: 0,
      armorVulnerable: 0.35,
      playerDefVulnerable: 0.35,
      dropQualityBias: 4,
      v2Skills: {
        learned: ["mob_arcane_nova"],
        equipped: ["mob_arcane_nova"],
      },
      v2MaxMp: 105,
    },
    traits: [
      "100틱마다 혹한의 전장으로 한기 누적",
      "냉기장과 피격으로 한기 누적",
      "한기 중첩당 행동 속도 감소",
      "10중첩 빙결 — 다음 행동 취소",
    ],
  },
  invincible_fortress: {
    id: "invincible_fortress",
    name: "불괴의 성채",
    pools: ["iron_legion", "mana_barrier"],
    summonMaterialId: "v2_unexplored_invincible_fortress_summon_stone",
    uniqueDrops: [
      {
        equipmentId: "v2_unexplored_magisteel_guard_gauntlets",
        equipmentName: "마철 수호완갑",
        chancePct: 30,
      },
      {
        equipmentId: "v2_unexplored_sealing_barrier_ring",
        equipmentName: "봉인 결계환",
        chancePct: 10,
      },
      {
        equipmentId: "v2_unexplored_invincible_fortress_armor",
        equipmentName: "불괴의 성채갑",
        chancePct: 0.5,
      },
    ],
    titleId: "v2_unexplored_invincible_fortress",
    sharedMaxHp: UNEXPLORED_BOSS_SHARED_MAX_HP,
    anchorDepth: 120,
    monster: {
      name: "불괴의 성채",
      tags: ["golem"],
      image: "/images/monster/v2/unexplored-boss-invincible-fortress.webp",
      hp: 1_250,
      atk: 6.2,
      def: 50,
      magicDef: 50,
      spd: 20,
      accuracy: -205,
      evasionPct: 8,
      exp: 0,
      armorVulnerable: 0.35,
      playerDefVulnerable: 0.35,
      dropQualityBias: 4,
      v2Skills: {
        learned: ["mob_arcane_bolt"],
        equipped: ["mob_arcane_bolt"],
      },
      v2MaxMp: 0,
    },
    traits: [
      "네 구간에서 방벽 시험",
      "400틱 동안 순간 피해 측정",
      "달성률이 높을수록 다음 광폭 약화",
    ],
  },
  skyward_crystal_eye: {
    id: "skyward_crystal_eye",
    name: "천공의 수정안",
    pools: ["crystal_artillery", "precision_hunters"],
    summonMaterialId: "v2_unexplored_skyward_crystal_eye_summon_stone",
    uniqueDrops: [
      {
        equipmentId: "v2_unexplored_prismatic_firing_gauntlets",
        equipmentName: "분광 사격완갑",
        chancePct: 30,
      },
      {
        equipmentId: "v2_unexplored_starpath_aiming_ring",
        equipmentName: "별궤 조준환",
        chancePct: 10,
      },
      {
        equipmentId: "v2_unexplored_infinite_focus_crystal_eye",
        equipmentName: "무한초점 수정안",
        chancePct: 0.5,
      },
    ],
    titleId: "v2_unexplored_skyward_crystal_eye",
    sharedMaxHp: UNEXPLORED_BOSS_SHARED_MAX_HP,
    anchorDepth: 120,
    monster: {
      name: "천공의 수정안",
      tags: ["golem", "spirit"],
      image: "/images/monster/v2/unexplored-boss-skyward-crystal-eye.webp",
      hp: 1_150,
      atk: 11.2,
      atkType: "magic",
      def: 42,
      magicDef: 48,
      spd: 22,
      accuracy: -185,
      evasionPct: 16,
      exp: 0,
      armorVulnerable: 0.35,
      playerDefVulnerable: 0.35,
      dropQualityBias: 4,
      v2Skills: {
        learned: ["mob_arcane_nova"],
        equipped: ["mob_arcane_nova"],
      },
      v2MaxMp: 105,
    },
    traits: [
      "900틱마다 천공 포격",
      "연타·치명타로 조준 붕괴",
      "24중첩 시 포격 50%·핵 노출",
    ],
  },
  immortal_berserker: {
    id: "immortal_berserker",
    name: "불멸의 광전왕",
    pools: ["regenerating_swarm", "red_berserkers"],
    summonMaterialId: "v2_unexplored_immortal_berserker_summon_stone",
    uniqueDrops: [
      {
        equipmentId: "v2_unexplored_immortal_king_greatsword",
        equipmentName: "불사왕의 대검",
        chancePct: 30,
      },
      {
        equipmentId: "v2_unexplored_pulsing_berserker_gauntlets",
        equipmentName: "맥동 광전완갑",
        chancePct: 10,
      },
      {
        equipmentId: "v2_unexplored_eternal_life_core",
        equipmentName: "영겁의 생명핵",
        chancePct: 0.5,
      },
    ],
    titleId: "v2_unexplored_immortal_berserker",
    sharedMaxHp: UNEXPLORED_BOSS_SHARED_MAX_HP,
    anchorDepth: 120,
    monster: {
      name: "불멸의 광전왕",
      tags: ["humanoid", "slime"],
      image: "/images/monster/v2/unexplored-boss-immortal-berserker.webp",
      hp: 1_200,
      atk: 15,
      def: 42,
      magicDef: 38,
      spd: 21,
      accuracy: -205,
      evasionPct: 10,
      exp: 0,
      skill: { kind: "heavy_blow", name: "광란 참격", everyPhases: 3, multiplier: 1.65 },
      armorVulnerable: 0.35,
      playerDefVulnerable: 0.35,
      dropQualityBias: 4,
      v2Skills: {
        learned: ["mob_savage_roar"],
        equipped: ["mob_savage_roar"],
      },
      v2MaxMp: 75,
    },
    traits: [
      "두 번 부활하는 세 개의 생명",
      "초기 생명은 주기적으로 재생",
      "부활할수록 재생은 약해지고 광폭은 강화",
    ],
  },
} as const satisfies Record<string, UnexploredBossDefinition>;

export type UnexploredBossId = keyof typeof UNEXPLORED_BOSSES;

export const UNEXPLORED_BOSS_IDS = Object.keys(
  UNEXPLORED_BOSSES,
) as UnexploredBossId[];

export type UnexploredBossEquipmentCraftRecipe = {
  bossId: UnexploredBossId;
  equipmentId: V2EquipmentId;
  equipmentName: string;
  chancePct: 30 | 10;
  bossCoreCost: 8 | 25;
  materialCosts: readonly [
    {
      poolId: UnexploredPoolId;
      materialId: string;
      materialName: string;
      count: 25 | 75;
    },
    {
      poolId: UnexploredPoolId;
      materialId: string;
      materialName: string;
      count: 25 | 75;
    },
  ];
};

export const UNEXPLORED_BOSS_EQUIPMENT_CRAFT_RECIPES =
  UNEXPLORED_BOSS_IDS.flatMap((bossId): UnexploredBossEquipmentCraftRecipe[] => {
    const boss = UNEXPLORED_BOSSES[bossId];
    return boss.uniqueDrops.flatMap((drop): UnexploredBossEquipmentCraftRecipe[] => {
      if (drop.chancePct === 0.5) return [];
      const bossCoreCost = drop.chancePct === 30 ? 8 : 25;
      const materialCount: 25 | 75 = drop.chancePct === 30 ? 25 : 75;
      const materialCost = (poolId: UnexploredPoolId) => ({
        poolId,
        materialId: UNEXPLORED_POOL_BY_ID[poolId].materialId,
        materialName: UNEXPLORED_POOL_BY_ID[poolId].materialName,
        count: materialCount,
      });
      return [{
        bossId,
        equipmentId: drop.equipmentId,
        equipmentName: drop.equipmentName,
        chancePct: drop.chancePct,
        bossCoreCost,
        materialCosts: [
          materialCost(boss.pools[0]),
          materialCost(boss.pools[1]),
        ],
      }];
    });
  });

export function unexploredBossEquipmentCraftRecipe(
  value: unknown,
): UnexploredBossEquipmentCraftRecipe | null {
  return typeof value === "string"
    ? UNEXPLORED_BOSS_EQUIPMENT_CRAFT_RECIPES.find(
      (recipe) => recipe.equipmentId === value,
    ) ?? null
    : null;
}

export function parseUnexploredBossId(value: unknown): UnexploredBossId | null {
  return typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(UNEXPLORED_BOSSES, value)
    ? (value as UnexploredBossId)
    : null;
}
