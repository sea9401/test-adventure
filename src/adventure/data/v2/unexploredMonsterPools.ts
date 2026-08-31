import type { MonsterTag } from "@/adventure/data/monsters/types";
import type { UnexploredSpeedBand } from "./unexploredSimulationBalance";

export const UNEXPLORED_POOL_IDS = [
  "iron_legion",
  "mana_barrier",
  "regenerating_swarm",
  "red_berserkers",
  "crystal_artillery",
  "precision_hunters",
  "runaway_machines",
  "shadow_stalkers",
  "venom_colony",
  "bloodstained_dead",
  "frozen_legion",
  "crushing_colossi",
] as const;

export type UnexploredPoolId = (typeof UNEXPLORED_POOL_IDS)[number];
export type UnexploredMonsterRole = "base" | "attack" | "variant";

export type UnexploredRelativeStats = {
  hp: number;
  atk: number;
  def: number;
  magicDef: number;
};

// 실제 Monster 필드로 변환할 값은 공통 기준과 상위 유저 시뮬레이션이 정해진 뒤 배선한다.
// 지금은 승인된 전투 정체성을 타입으로 고정해 UI와 밸런스 도구가 같은 어휘를 사용하게 한다.
export type UnexploredAbilityId =
  | "brace"
  | "pierce"
  | "heavy_every_3"
  | "status_resist_15"
  | "status_resist_35_brace"
  | "arcane_bolt"
  | "heal"
  | "attack_and_heal"
  | "extra_heal_uses"
  | "low_hp_enrage"
  | "high_crit"
  | "periodic_heavy"
  | "arcane_burst"
  | "limited_arcane_nova"
  | "high_accuracy"
  | "high_accuracy_crit"
  | "high_accuracy_pierce"
  | "fast_actions"
  | "bonus_attack_50"
  | "bonus_attack_low_hp_enrage"
  | "high_evasion"
  | "evasion_crit"
  | "very_high_evasion_pierce"
  | "poison_1"
  | "poison_2"
  | "poison_2_survival_debuff"
  | "bleed"
  | "fast_bleed"
  | "bleed_periodic_heavy"
  | "slow"
  | "strong_slow_arcane"
  | "frost_limited_burst"
  | "crushing_blow";

export type UnexploredMonsterDefinition = {
  id: string;
  name: string;
  role: UnexploredMonsterRole;
  speedBand: UnexploredSpeedBand;
  tags: readonly MonsterTag[];
  stats: UnexploredRelativeStats;
  abilities: readonly UnexploredAbilityId[];
};

export type UnexploredRewardCategory =
  | "material"
  | "equipment"
  | "quality"
  | "gold"
  | "general";

export type UnexploredMonsterPool = {
  id: UnexploredPoolId;
  name: string;
  materialId: `v2_unexplored_${UnexploredPoolId}_material`;
  materialName: string;
  focusDescription: string;
  rewardCategories: readonly UnexploredRewardCategory[];
  slowKillRewardBonusPctRange?: readonly [10, 15];
  launchMonster: UnexploredMonsterDefinition;
  expansionCandidates: readonly [
    UnexploredMonsterDefinition,
    UnexploredMonsterDefinition,
  ];
  /** 전체 설계 카탈로그. 출시 조우는 launchMonster만 사용한다. */
  monsters: readonly [
    UnexploredMonsterDefinition,
    UnexploredMonsterDefinition,
    UnexploredMonsterDefinition,
  ];
};

type UnexploredMonsterPoolSeed = Omit<
  UnexploredMonsterPool,
  "launchMonster" | "expansionCandidates"
>;

function definePool<const T extends UnexploredMonsterPoolSeed>(
  pool: T,
): T & Pick<UnexploredMonsterPool, "launchMonster" | "expansionCandidates"> {
  return {
    ...pool,
    launchMonster: pool.monsters[0],
    expansionCandidates: [pool.monsters[1], pool.monsters[2]],
  };
}

export const UNEXPLORED_MONSTER_POOLS = [
  definePool({
    id: "iron_legion",
    name: "철갑 군단",
    materialId: "v2_unexplored_iron_legion_material",
    materialName: "강화 철편",
    focusDescription: "물리 방어 증가",
    rewardCategories: ["material", "equipment"],
    monsters: [
      {
        id: "armored_shieldman",
        name: "철갑 방패병",
        role: "base",
        speedBand: "slow",
        tags: ["humanoid"],
        stats: { hp: 1.1, atk: 0.9, def: 1.8, magicDef: 0.85 },
        abilities: ["brace"],
      },
      {
        id: "armored_spearman",
        name: "철갑 창병",
        role: "attack",
        speedBand: "normal",
        tags: ["humanoid"],
        stats: { hp: 0.95, atk: 1.05, def: 1.65, magicDef: 0.75 },
        abilities: ["pierce"],
      },
      {
        id: "armored_crusher",
        name: "철갑 파쇄병",
        role: "variant",
        speedBand: "slow",
        tags: ["humanoid"],
        stats: { hp: 1.2, atk: 1.1, def: 1.9, magicDef: 0.8 },
        abilities: ["heavy_every_3"],
      },
    ],
  }),
  definePool({
    id: "mana_barrier",
    name: "마력 방벽체",
    materialId: "v2_unexplored_mana_barrier_material",
    materialName: "방벽 결정",
    focusDescription: "마법 방어와 상태 피해 저항 증가",
    rewardCategories: ["material", "quality"],
    monsters: [
      {
        id: "barrier_guardian",
        name: "결계 수호체",
        role: "base",
        speedBand: "slow",
        tags: ["golem"],
        stats: { hp: 1.05, atk: 0.9, def: 0.85, magicDef: 1.9 },
        abilities: ["status_resist_15"],
      },
      {
        id: "rune_executor",
        name: "룬 집행자",
        role: "attack",
        speedBand: "normal",
        tags: ["golem"],
        stats: { hp: 0.9, atk: 1.1, def: 0.7, magicDef: 1.7 },
        abilities: ["arcane_bolt"],
      },
      {
        id: "seal_watcher",
        name: "봉인 감시체",
        role: "variant",
        speedBand: "slow",
        tags: ["golem"],
        stats: { hp: 1.1, atk: 0.95, def: 0.9, magicDef: 1.85 },
        abilities: ["status_resist_35_brace"],
      },
    ],
  }),
  definePool({
    id: "regenerating_swarm",
    name: "재생 군체",
    materialId: "v2_unexplored_regenerating_swarm_material",
    materialName: "재생 조직",
    focusDescription: "체력과 회복 가능 횟수 증가",
    rewardCategories: ["material", "general"],
    monsters: [
      {
        id: "regenerating_spore",
        name: "재생 포자체",
        role: "base",
        speedBand: "slow",
        tags: ["slime"],
        stats: { hp: 1.45, atk: 0.85, def: 0.9, magicDef: 0.9 },
        abilities: ["heal"],
      },
      {
        id: "devouring_regenerator",
        name: "포식 재생체",
        role: "attack",
        speedBand: "normal",
        tags: ["beast"],
        stats: { hp: 1.2, atk: 1.1, def: 0.8, magicDef: 0.8 },
        abilities: ["attack_and_heal"],
      },
      {
        id: "proliferating_core",
        name: "증식 핵체",
        role: "variant",
        speedBand: "slow",
        tags: ["slime"],
        stats: { hp: 1.7, atk: 0.9, def: 0.95, magicDef: 0.95 },
        abilities: ["extra_heal_uses"],
      },
    ],
  }),
  definePool({
    id: "red_berserkers",
    name: "붉은 광전대",
    materialId: "v2_unexplored_red_berserkers_material",
    materialName: "광폭 혈석",
    focusDescription: "공격력과 치명타 증가",
    rewardCategories: ["material", "gold"],
    monsters: [
      {
        id: "red_berserker",
        name: "붉은 광전병",
        role: "base",
        speedBand: "normal",
        tags: ["humanoid"],
        stats: { hp: 0.9, atk: 1.3, def: 0.75, magicDef: 0.8 },
        abilities: ["low_hp_enrage"],
      },
      {
        id: "blood_duelist",
        name: "혈전 투사",
        role: "attack",
        speedBand: "fast",
        tags: ["humanoid"],
        stats: { hp: 0.8, atk: 1.25, def: 0.7, magicDef: 0.7 },
        abilities: ["high_crit"],
      },
      {
        id: "red_executioner",
        name: "붉은 처형자",
        role: "variant",
        speedBand: "slow",
        tags: ["humanoid"],
        stats: { hp: 1.05, atk: 1.4, def: 0.8, magicDef: 0.8 },
        abilities: ["periodic_heavy"],
      },
    ],
  }),
  definePool({
    id: "crystal_artillery",
    name: "수정 포격대",
    materialId: "v2_unexplored_crystal_artillery_material",
    materialName: "수정 렌즈",
    focusDescription: "마법 공격과 스킬 사용 가능 횟수 증가",
    rewardCategories: ["material", "equipment"],
    monsters: [
      {
        id: "crystal_mage",
        name: "수정 술사",
        role: "base",
        speedBand: "normal",
        tags: ["spirit"],
        stats: { hp: 0.9, atk: 1.15, def: 0.8, magicDef: 1.1 },
        abilities: ["arcane_bolt"],
      },
      {
        id: "refraction_artillery",
        name: "굴절 포격체",
        role: "attack",
        speedBand: "slow",
        tags: ["golem"],
        stats: { hp: 0.75, atk: 1.35, def: 0.7, magicDef: 1 },
        abilities: ["arcane_burst"],
      },
      {
        id: "crystal_sentinel",
        name: "수정 파수체",
        role: "variant",
        speedBand: "slow",
        tags: ["golem"],
        stats: { hp: 1.05, atk: 1.1, def: 1.15, magicDef: 1.25 },
        abilities: ["limited_arcane_nova"],
      },
    ],
  }),
  definePool({
    id: "precision_hunters",
    name: "정밀 사냥단",
    materialId: "v2_unexplored_precision_hunters_material",
    materialName: "정밀 조준경",
    focusDescription: "적중, 치명타와 관통 증가",
    rewardCategories: ["material", "quality"],
    monsters: [
      {
        id: "precision_scout",
        name: "정밀 척후병",
        role: "base",
        speedBand: "fast",
        tags: ["humanoid"],
        stats: { hp: 0.95, atk: 1.05, def: 0.9, magicDef: 0.9 },
        abilities: ["high_accuracy"],
      },
      {
        id: "lethal_sniper",
        name: "치명 저격수",
        role: "attack",
        speedBand: "normal",
        tags: ["humanoid"],
        stats: { hp: 0.8, atk: 1.2, def: 0.75, magicDef: 0.8 },
        abilities: ["high_accuracy_crit"],
      },
      {
        id: "armor_hunter",
        name: "갑옷 사냥꾼",
        role: "variant",
        speedBand: "normal",
        tags: ["humanoid"],
        stats: { hp: 1, atk: 1.1, def: 1, magicDef: 0.9 },
        abilities: ["high_accuracy_pierce"],
      },
    ],
  }),
  definePool({
    id: "runaway_machines",
    name: "폭주 기계",
    materialId: "v2_unexplored_runaway_machines_material",
    materialName: "과열 동력핵",
    focusDescription: "속도와 추가 공격 확률 증가",
    rewardCategories: ["material", "gold"],
    monsters: [
      {
        id: "rushing_machine",
        name: "질주 기계",
        role: "base",
        speedBand: "extreme",
        tags: ["golem"],
        stats: { hp: 0.9, atk: 0.9, def: 1, magicDef: 0.85 },
        abilities: ["fast_actions"],
      },
      {
        id: "combo_automaton",
        name: "연격 자동인형",
        role: "attack",
        speedBand: "fast",
        tags: ["golem"],
        stats: { hp: 0.8, atk: 0.75, def: 0.9, magicDef: 0.85 },
        abilities: ["bonus_attack_50"],
      },
      {
        id: "overheated_enforcer",
        name: "과열 집행기",
        role: "variant",
        speedBand: "fast",
        tags: ["golem"],
        stats: { hp: 0.95, atk: 0.9, def: 1, magicDef: 0.9 },
        abilities: ["bonus_attack_low_hp_enrage"],
      },
    ],
  }),
  definePool({
    id: "shadow_stalkers",
    name: "그림자 추적자",
    materialId: "v2_unexplored_shadow_stalkers_material",
    materialName: "그림자 피막",
    focusDescription: "회피와 속도 증가",
    rewardCategories: ["material", "quality"],
    monsters: [
      {
        id: "shadow_scout",
        name: "그림자 척후병",
        role: "base",
        speedBand: "fast",
        tags: ["humanoid"],
        stats: { hp: 0.85, atk: 1, def: 0.8, magicDef: 0.9 },
        abilities: ["high_evasion"],
      },
      {
        id: "night_assassin",
        name: "밤의 암살자",
        role: "attack",
        speedBand: "fast",
        tags: ["humanoid"],
        stats: { hp: 0.75, atk: 1.2, def: 0.65, magicDef: 0.8 },
        abilities: ["evasion_crit"],
      },
      {
        id: "phantom_stalker",
        name: "허상 추적귀",
        role: "variant",
        speedBand: "extreme",
        tags: ["spirit"],
        stats: { hp: 0.7, atk: 1.05, def: 0.7, magicDef: 0.9 },
        abilities: ["very_high_evasion_pierce"],
      },
    ],
  }),
  definePool({
    id: "venom_colony",
    name: "맹독 군락",
    materialId: "v2_unexplored_venom_colony_material",
    materialName: "농축 독낭",
    focusDescription: "중독 중첩량 증가",
    rewardCategories: ["material", "general"],
    monsters: [
      {
        id: "venom_fang_devourer",
        name: "독니 포식자",
        role: "base",
        speedBand: "normal",
        tags: ["beast"],
        stats: { hp: 1, atk: 0.9, def: 0.95, magicDef: 0.95 },
        abilities: ["poison_1"],
      },
      {
        id: "venom_sprayer",
        name: "맹독 살포체",
        role: "attack",
        speedBand: "fast",
        tags: ["slime"],
        stats: { hp: 0.85, atk: 1.05, def: 0.8, magicDef: 0.9 },
        abilities: ["poison_2"],
      },
      {
        id: "corrosive_colony",
        name: "부식 군체",
        role: "variant",
        speedBand: "slow",
        tags: ["slime"],
        stats: { hp: 1.15, atk: 0.9, def: 1.05, magicDef: 1 },
        abilities: ["poison_2_survival_debuff"],
      },
    ],
  }),
  definePool({
    id: "bloodstained_dead",
    name: "혈흔 망자",
    materialId: "v2_unexplored_bloodstained_dead_material",
    materialName: "응고 혈액",
    focusDescription: "출혈 중첩량과 직접 공격력 증가",
    rewardCategories: ["material", "gold"],
    monsters: [
      {
        id: "hooked_dead",
        name: "갈고리 망자",
        role: "base",
        speedBand: "normal",
        tags: ["undead"],
        stats: { hp: 1, atk: 1.05, def: 0.9, magicDef: 0.9 },
        abilities: ["bleed"],
      },
      {
        id: "bloodtrail_pursuer",
        name: "혈주 추격자",
        role: "attack",
        speedBand: "fast",
        tags: ["undead"],
        stats: { hp: 0.85, atk: 1, def: 0.8, magicDef: 0.85 },
        abilities: ["fast_bleed"],
      },
      {
        id: "severing_executioner",
        name: "절단 집행자",
        role: "variant",
        speedBand: "slow",
        tags: ["undead"],
        stats: { hp: 1.1, atk: 1.2, def: 1, magicDef: 0.9 },
        abilities: ["bleed_periodic_heavy"],
      },
    ],
  }),
  definePool({
    id: "frozen_legion",
    name: "혹한 군단",
    materialId: "v2_unexplored_frozen_legion_material",
    materialName: "혹한 결정",
    focusDescription: "둔화 효과와 마법 공격 증가",
    rewardCategories: ["material"],
    monsters: [
      {
        id: "frost_toucher",
        name: "서리 접촉자",
        role: "base",
        speedBand: "normal",
        tags: ["spirit"],
        stats: { hp: 1.05, atk: 0.9, def: 1.05, magicDef: 1.1 },
        abilities: ["slow"],
      },
      {
        id: "freezing_mage",
        name: "빙결 술사",
        role: "attack",
        speedBand: "normal",
        tags: ["humanoid"],
        stats: { hp: 0.85, atk: 1.15, def: 0.8, magicDef: 1.1 },
        abilities: ["strong_slow_arcane"],
      },
      {
        id: "frozen_sentinel",
        name: "혹한 파수자",
        role: "variant",
        speedBand: "slow",
        tags: ["golem"],
        stats: { hp: 1.2, atk: 1.05, def: 1.15, magicDef: 1.25 },
        abilities: ["frost_limited_burst"],
      },
    ],
  }),
  definePool({
    id: "crushing_colossi",
    name: "파쇄 거수",
    materialId: "v2_unexplored_crushing_colossi_material",
    materialName: "거수 골편",
    focusDescription: "공격력, 관통과 강타 피해 증가",
    rewardCategories: ["material", "equipment"],
    slowKillRewardBonusPctRange: [10, 15],
    monsters: [
      {
        id: "bedrock_colossus",
        name: "암반 거수",
        role: "base",
        speedBand: "slow",
        tags: ["golem"],
        stats: { hp: 1.4, atk: 1.1, def: 1.2, magicDef: 0.9 },
        abilities: ["periodic_heavy"],
      },
      {
        id: "ironwall_crusher",
        name: "철벽 분쇄자",
        role: "attack",
        speedBand: "slow",
        tags: ["golem"],
        stats: { hp: 1.25, atk: 1.25, def: 1.1, magicDef: 0.85 },
        abilities: ["pierce"],
      },
      {
        id: "crust_destroyer",
        name: "지각 파괴자",
        role: "variant",
        speedBand: "slow",
        tags: ["golem"],
        stats: { hp: 1.55, atk: 1.35, def: 1.25, magicDef: 0.9 },
        abilities: ["crushing_blow"],
      },
    ],
  }),
] as const satisfies readonly UnexploredMonsterPool[];

export const UNEXPLORED_POOL_BY_ID = Object.fromEntries(
  UNEXPLORED_MONSTER_POOLS.map(
    (pool): [UnexploredPoolId, UnexploredMonsterPool] => [pool.id, pool],
  ),
) as Record<UnexploredPoolId, UnexploredMonsterPool>;

export const UNEXPLORED_MONSTER_BY_ID = Object.fromEntries(
  UNEXPLORED_MONSTER_POOLS.flatMap((pool) =>
    pool.monsters.map((monster) => [monster.id, monster]),
  ),
) as Record<string, UnexploredMonsterDefinition>;
