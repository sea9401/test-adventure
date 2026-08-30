import type { V2EquipSlot } from "./v2Equipment";

export type LiberationOptionUnit =
  | "integer"
  | "pct"
  | "percentage_point"
  | "chance_multiplier_pct"
  | "growth_range";

export const LIBERATION_OPTION_DEFINITIONS = {
  base_str_pct: { label: "기초 STR", maxValue: 9, unit: "pct" },
  base_dex_pct: { label: "기초 DEX", maxValue: 9, unit: "pct" },
  base_vit_pct: { label: "기초 VIT", maxValue: 9, unit: "pct" },
  base_int_pct: { label: "기초 INT", maxValue: 9, unit: "pct" },
  base_spi_pct: { label: "기초 SPI", maxValue: 9, unit: "pct" },
  base_luk_pct: { label: "기초 LUK", maxValue: 9, unit: "pct" },
  physical_attack_flat: { label: "물리 공격력", maxValue: 100, unit: "integer" },
  magic_attack_flat: { label: "마법 공격력", maxValue: 100, unit: "integer" },
  physical_attack_pct: { label: "물리 공격력", maxValue: 9, unit: "pct" },
  magic_attack_pct: { label: "마법 공격력", maxValue: 9, unit: "pct" },
  physical_defense_flat: { label: "물리 방어력", maxValue: 100, unit: "integer" },
  magic_defense_flat: { label: "마법 방어력", maxValue: 100, unit: "integer" },
  physical_defense_pct: { label: "물리 방어력", maxValue: 9, unit: "pct" },
  magic_defense_pct: { label: "마법 방어력", maxValue: 9, unit: "pct" },
  physical_penetration_pct: { label: "물리 방어 관통", maxValue: 9, unit: "pct" },
  magic_penetration_pct: { label: "마법 방어 관통", maxValue: 9, unit: "pct" },
  max_hp_flat: { label: "최대 HP", maxValue: 500, unit: "integer" },
  max_mp_flat: { label: "최대 MP", maxValue: 500, unit: "integer" },
  max_hp_pct: { label: "최대 HP", maxValue: 9, unit: "pct" },
  accuracy_flat: { label: "명중", maxValue: 60, unit: "integer" },
  evasion_flat: { label: "회피 수치", maxValue: 40, unit: "integer" },
  final_evasion_effect_pp: {
    label: "최종 회피 효과",
    maxValue: 5,
    unit: "percentage_point",
  },
  speed_flat: { label: "속도", maxValue: 20, unit: "integer" },
  crit_chance_pp: { label: "치명타 확률", maxValue: 10, unit: "percentage_point" },
  crit_damage_pp: { label: "치명타 피해", maxValue: 60, unit: "percentage_point" },
  skill_crit_damage_pp: {
    label: "스킬 치명타 피해",
    maxValue: 40,
    unit: "percentage_point",
  },
  crit_resist_pp: { label: "치명타 저항", maxValue: 10, unit: "percentage_point" },
  status_damage_reduction_pct: {
    label: "상태이상 피해 감소",
    maxValue: 15,
    unit: "pct",
  },
  all_damage_pct: { label: "모든 피해", maxValue: 5, unit: "pct" },
  boss_damage_pct: { label: "보스 피해", maxValue: 7, unit: "pct" },
  damage_taken_reduction_pct: {
    label: "받는 피해 감소",
    maxValue: 6,
    unit: "pct",
  },
  battle_start_shield_max_hp_pct: {
    label: "전투 시작 보호막",
    maxValue: 10,
    unit: "pct",
  },
  healing_received_pct: { label: "받는 회복량", maxValue: 20, unit: "pct" },
  healing_output_pct: { label: "주는 회복량", maxValue: 20, unit: "pct" },
  skill_mp_cost_reduction_pct: {
    label: "스킬 MP 소모 감소",
    maxValue: 10,
    unit: "pct",
  },
  post_hunt_hp_restore_pct: {
    label: "사냥 후 HP 회복",
    maxValue: 10,
    unit: "pct",
  },
  post_hunt_mp_restore_pct: {
    label: "사냥 후 MP 회복",
    maxValue: 10,
    unit: "pct",
  },
  hunt_gold_pct: { label: "사냥 골드", maxValue: 10, unit: "pct" },
  hunt_exp_pct: { label: "사냥 경험치", maxValue: 20, unit: "pct" },
  equipment_drop_pct: {
    label: "장비 드롭",
    maxValue: 15,
    unit: "chance_multiplier_pct",
  },
  normal_material_drop_pct: {
    label: "일반 재료 드롭",
    maxValue: 20,
    unit: "chance_multiplier_pct",
  },
  special_material_drop_pct: {
    label: "특화 재료 드롭",
    maxValue: 20,
    unit: "chance_multiplier_pct",
  },
  rare_material_drop_pct: {
    label: "희귀 재료 드롭",
    maxValue: 20,
    unit: "chance_multiplier_pct",
  },
  normal_and_special_material_drop_pct: {
    label: "일반·특화 재료 드롭",
    maxValue: 20,
    unit: "chance_multiplier_pct",
  },
  rare_map_and_summon_scroll_drop_pct: {
    label: "희귀 지도·일반 보스 소환서 드롭",
    maxValue: 20,
    unit: "chance_multiplier_pct",
  },
  minimum_equipment_quality_pp: {
    label: "드롭 장비 최소 품질",
    maxValue: 10,
    unit: "percentage_point",
  },
  personal_craft_gold_discount_pct: {
    label: "개인 제작·조합 골드 비용 할인",
    maxValue: 10,
    unit: "pct",
  },
  level_up_max_hp_growth: {
    label: "레벨업 시 최대 HP 추가 성장",
    maxValue: 30,
    unit: "growth_range",
  },
  level_up_max_mp_growth: {
    label: "레벨업 시 최대 MP 추가 성장",
    maxValue: 10,
    unit: "growth_range",
  },
} as const satisfies Record<
  string,
  { label: string; maxValue: number; unit: LiberationOptionUnit }
>;

export type LiberationOptionId = keyof typeof LIBERATION_OPTION_DEFINITIONS;
export type LiberationOptionDefinition =
  (typeof LIBERATION_OPTION_DEFINITIONS)[LiberationOptionId];
export type LiberationOptionWeight = 5 | 15 | 40 | 70 | 100;
export type LiberationPoolEntry = LiberationOptionDefinition & {
  id: LiberationOptionId;
  weight: LiberationOptionWeight;
};

function entry(
  id: LiberationOptionId,
  weight: LiberationOptionWeight,
): LiberationPoolEntry {
  return { id, weight, ...LIBERATION_OPTION_DEFINITIONS[id] };
}

export const EQUIPMENT_LIBERATION_POOLS = {
  weapon: [
    entry("base_spi_pct", 100),
    entry("physical_attack_flat", 100),
    entry("magic_attack_flat", 100),
    entry("accuracy_flat", 100),
    entry("base_str_pct", 70),
    entry("base_dex_pct", 70),
    entry("base_int_pct", 70),
    entry("hunt_gold_pct", 70),
    entry("equipment_drop_pct", 70),
    entry("crit_chance_pp", 40),
    entry("crit_damage_pp", 40),
    entry("physical_attack_pct", 15),
    entry("magic_attack_pct", 15),
    entry("physical_penetration_pct", 15),
    entry("magic_penetration_pct", 15),
    entry("all_damage_pct", 5),
  ],
  armor: [
    entry("base_str_pct", 100),
    entry("base_int_pct", 100),
    entry("crit_resist_pp", 100),
    entry("status_damage_reduction_pct", 100),
    entry("post_hunt_hp_restore_pct", 100),
    entry("base_vit_pct", 70),
    entry("base_spi_pct", 70),
    entry("hunt_gold_pct", 70),
    entry("healing_received_pct", 70),
    entry("max_hp_pct", 40),
    entry("physical_defense_pct", 40),
    entry("magic_defense_pct", 40),
    entry("damage_taken_reduction_pct", 15),
    entry("battle_start_shield_max_hp_pct", 15),
    entry("level_up_max_hp_growth", 5),
  ],
  gloves: [
    entry("base_int_pct", 100),
    entry("physical_attack_flat", 100),
    entry("magic_attack_flat", 100),
    entry("accuracy_flat", 100),
    entry("base_str_pct", 70),
    entry("base_dex_pct", 70),
    entry("base_luk_pct", 70),
    entry("special_material_drop_pct", 70),
    entry("equipment_drop_pct", 70),
    entry("crit_chance_pp", 40),
    entry("crit_damage_pp", 40),
    entry("minimum_equipment_quality_pp", 15),
    entry("skill_crit_damage_pp", 15),
    entry("boss_damage_pct", 15),
  ],
  boots: [
    entry("base_spi_pct", 100),
    entry("physical_defense_flat", 100),
    entry("magic_defense_flat", 100),
    entry("hunt_exp_pct", 100),
    entry("base_dex_pct", 70),
    entry("base_vit_pct", 70),
    entry("base_luk_pct", 70),
    entry("hunt_gold_pct", 70),
    entry("normal_material_drop_pct", 70),
    entry("speed_flat", 40),
    entry("evasion_flat", 40),
    entry("final_evasion_effect_pp", 15),
  ],
  ring: [
    entry("base_str_pct", 100),
    entry("base_dex_pct", 100),
    entry("base_int_pct", 100),
    entry("accuracy_flat", 100),
    entry("base_luk_pct", 70),
    entry("max_hp_flat", 70),
    entry("hunt_gold_pct", 70),
    entry("equipment_drop_pct", 70),
    entry("crit_chance_pp", 40),
    entry("crit_damage_pp", 40),
    entry("rare_material_drop_pct", 40),
    entry("rare_map_and_summon_scroll_drop_pct", 15),
    entry("personal_craft_gold_discount_pct", 5),
  ],
  necklace: [
    entry("base_vit_pct", 100),
    entry("base_luk_pct", 100),
    entry("status_damage_reduction_pct", 100),
    entry("post_hunt_mp_restore_pct", 100),
    entry("hunt_exp_pct", 100),
    entry("base_int_pct", 70),
    entry("base_spi_pct", 70),
    entry("magic_defense_flat", 70),
    entry("healing_output_pct", 70),
    entry("normal_and_special_material_drop_pct", 70),
    entry("max_mp_flat", 40),
    entry("skill_mp_cost_reduction_pct", 15),
    entry("level_up_max_mp_growth", 5),
  ],
} as const satisfies Record<V2EquipSlot, readonly LiberationPoolEntry[]>;

export function liberationOptionDefinition(
  id: LiberationOptionId,
): LiberationOptionDefinition {
  return LIBERATION_OPTION_DEFINITIONS[id];
}

export function firstLineProbability(
  slot: V2EquipSlot,
  id: LiberationOptionId,
): number {
  const pool = EQUIPMENT_LIBERATION_POOLS[slot];
  const selected = pool.find((option) => option.id === id);
  if (!selected) return 0;
  const totalWeight = pool.reduce((sum, option) => sum + option.weight, 0);
  return selected.weight / totalWeight;
}
