import { describe, expect, it } from "vitest";
import type { V2EquipSlot } from "./v2Equipment";
import {
  EQUIPMENT_LIBERATION_POOLS,
  firstLineProbability,
  liberationOptionDefinition,
} from "./equipmentLiberationCatalog";

const EXPECTED_IDS = {
  weapon: [
    "base_spi_pct",
    "physical_attack_flat",
    "magic_attack_flat",
    "accuracy_flat",
    "base_str_pct",
    "base_dex_pct",
    "base_int_pct",
    "hunt_gold_pct",
    "equipment_drop_pct",
    "crit_chance_pp",
    "crit_damage_pp",
    "physical_attack_pct",
    "magic_attack_pct",
    "physical_penetration_pct",
    "magic_penetration_pct",
    "all_damage_pct",
  ],
  armor: [
    "base_str_pct",
    "base_int_pct",
    "crit_resist_pp",
    "status_damage_reduction_pct",
    "post_hunt_hp_restore_pct",
    "base_vit_pct",
    "base_spi_pct",
    "hunt_gold_pct",
    "healing_received_pct",
    "max_hp_pct",
    "physical_defense_pct",
    "magic_defense_pct",
    "damage_taken_reduction_pct",
    "battle_start_shield_max_hp_pct",
    "level_up_max_hp_growth",
  ],
  gloves: [
    "base_int_pct",
    "physical_attack_flat",
    "magic_attack_flat",
    "accuracy_flat",
    "base_str_pct",
    "base_dex_pct",
    "base_luk_pct",
    "special_material_drop_pct",
    "equipment_drop_pct",
    "crit_chance_pp",
    "crit_damage_pp",
    "minimum_equipment_quality_pp",
    "skill_crit_damage_pp",
    "boss_damage_pct",
  ],
  boots: [
    "base_spi_pct",
    "physical_defense_flat",
    "magic_defense_flat",
    "hunt_exp_pct",
    "base_dex_pct",
    "base_vit_pct",
    "base_luk_pct",
    "hunt_gold_pct",
    "normal_material_drop_pct",
    "speed_flat",
    "evasion_flat",
    "final_evasion_effect_pp",
  ],
  ring: [
    "base_str_pct",
    "base_dex_pct",
    "base_int_pct",
    "accuracy_flat",
    "base_luk_pct",
    "max_hp_flat",
    "hunt_gold_pct",
    "equipment_drop_pct",
    "crit_chance_pp",
    "crit_damage_pp",
    "rare_material_drop_pct",
    "rare_map_and_summon_scroll_drop_pct",
    "personal_craft_gold_discount_pct",
  ],
  necklace: [
    "base_vit_pct",
    "base_luk_pct",
    "status_damage_reduction_pct",
    "post_hunt_mp_restore_pct",
    "hunt_exp_pct",
    "base_int_pct",
    "base_spi_pct",
    "magic_defense_flat",
    "healing_output_pct",
    "normal_and_special_material_drop_pct",
    "max_mp_flat",
    "skill_mp_cost_reduction_pct",
    "level_up_max_mp_growth",
  ],
} as const satisfies Record<V2EquipSlot, readonly string[]>;

describe("equipment liberation option catalog", () => {
  it("keeps each slot's approved option pool complete and duplicate-free", () => {
    for (const [slot, expectedIds] of Object.entries(EXPECTED_IDS) as Array<
      [V2EquipSlot, readonly string[]]
    >) {
      const actualIds = EQUIPMENT_LIBERATION_POOLS[slot].map(({ id }) => id);
      expect(actualIds, slot).toEqual(expectedIds);
      expect(new Set(actualIds).size, slot).toBe(actualIds.length);
    }
  });

  it("uses the approved weights and level-20 maxima", () => {
    expect(liberationOptionDefinition("all_damage_pct")).toMatchObject({
      label: "모든 피해",
      maxValue: 5,
      unit: "pct",
    });
    expect(liberationOptionDefinition("level_up_max_hp_growth")).toMatchObject({
      maxValue: 30,
      unit: "growth_range",
    });
    expect(liberationOptionDefinition("level_up_max_mp_growth")).toMatchObject({
      maxValue: 10,
      unit: "growth_range",
    });
    expect(liberationOptionDefinition("equipment_drop_pct")).toMatchObject({
      maxValue: 15,
      unit: "chance_multiplier_pct",
    });
    expect(liberationOptionDefinition("crit_damage_pp")).toMatchObject({
      maxValue: 60,
      unit: "percentage_point",
    });
    expect(liberationOptionDefinition("physical_attack_flat")).toMatchObject({
      maxValue: 100,
      unit: "integer",
    });
    expect(
      EQUIPMENT_LIBERATION_POOLS.weapon.find(
        ({ id }) => id === "all_damage_pct",
      )?.weight,
    ).toBe(5);
    expect(
      EQUIPMENT_LIBERATION_POOLS.weapon.find(
        ({ id }) => id === "physical_attack_flat",
      )?.weight,
    ).toBe(100);
  });

  it("reports literal first-line probabilities from each slot's full weight", () => {
    // weapon total = 4*100 + 5*70 + 2*40 + 4*15 + 1*5 = 895
    expect(firstLineProbability("weapon", "all_damage_pct")).toBeCloseTo(
      5 / 895,
      12,
    );
    expect(firstLineProbability("weapon", "physical_attack_flat")).toBeCloseTo(
      100 / 895,
      12,
    );
    expect(firstLineProbability("weapon", "max_hp_flat")).toBe(0);

    for (const [slot, pool] of Object.entries(
      EQUIPMENT_LIBERATION_POOLS,
    ) as Array<[V2EquipSlot, (typeof EQUIPMENT_LIBERATION_POOLS)[V2EquipSlot]]>) {
      const total = pool.reduce(
        (sum, option) => sum + firstLineProbability(slot, option.id),
        0,
      );
      expect(total, slot).toBeCloseTo(1, 12);
    }
  });
});
