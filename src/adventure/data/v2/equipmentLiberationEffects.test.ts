import { describe, expect, it } from "vitest";
import {
  deriveEquippedLiberationEffects,
  deriveLiberationHuntSnapshot,
} from "./equipmentLiberationEffects";

function rankOneLiberation(
  options: Array<{ id: string; level?: number }>,
) {
  return {
    rank: 1,
    lineCount: options.length,
    revision: 1,
    options: options.map(({ id, level = 20 }) => ({ id, level })),
  };
}

describe("deriveEquippedLiberationEffects", () => {
  it("사냥 시작 시 보상·성장·회복 효과를 불변 스냅샷으로 분리한다", () => {
    const equipment = {
      owned: [
        {
          iid: "armor",
          id: "v2_storm_wreckage_armor",
          liberation: rankOneLiberation([
            { id: "hunt_gold_pct" },
            { id: "post_hunt_hp_restore_pct" },
          ]),
        },
        {
          iid: "necklace",
          id: "v2_storm_sanctuary_necklace",
          liberation: rankOneLiberation([
            { id: "hunt_exp_pct" },
            { id: "post_hunt_mp_restore_pct" },
          ]),
        },
      ],
      equipped: { armor: "armor", necklace: "necklace" },
    };

    const snapshot = deriveLiberationHuntSnapshot(equipment);
    expect(snapshot.effects).toMatchObject({ goldPct: 10, expPct: 20 });
    expect(snapshot).toMatchObject({
      postHuntHpRestorePct: 10,
      postHuntMpRestorePct: 10,
    });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.effects)).toBe(true);
    expect(Object.isFrozen(snapshot.growth)).toBe(true);
  });

  it("장착 개체의 해방 옵션만 부위 간 합산한다", () => {
    const effects = deriveEquippedLiberationEffects({
      owned: [
        {
          iid: "weapon",
          id: "v2_storm_wreckage_greatsword",
          liberation: rankOneLiberation([
            { id: "base_str_pct" },
            { id: "physical_attack_flat" },
            { id: "physical_attack_pct" },
          ]),
        },
        {
          iid: "armor",
          id: "v2_storm_wreckage_armor",
          liberation: rankOneLiberation([
            { id: "base_str_pct" },
            { id: "max_hp_pct" },
            { id: "damage_taken_reduction_pct" },
          ]),
        },
        {
          iid: "boots",
          id: "v2_storm_wreckage_boots",
          liberation: rankOneLiberation([
            { id: "evasion_flat" },
            { id: "final_evasion_effect_pp" },
            { id: "speed_flat" },
          ]),
        },
        {
          iid: "ring",
          id: "v2_storm_sanctuary_ring",
          liberation: rankOneLiberation([
            { id: "max_hp_flat" },
            { id: "rare_material_drop_pct" },
            { id: "personal_craft_gold_discount_pct" },
          ]),
        },
        {
          iid: "necklace",
          id: "v2_storm_sanctuary_necklace",
          liberation: rankOneLiberation([
            { id: "max_mp_flat" },
            { id: "healing_output_pct" },
            { id: "skill_mp_cost_reduction_pct" },
          ]),
        },
        {
          iid: "inventory-only",
          id: "v2_storm_wreckage_gloves",
          liberation: rankOneLiberation([
            { id: "skill_crit_damage_pp" },
            { id: "boss_damage_pct" },
            { id: "special_material_drop_pct" },
          ]),
        },
      ],
      equipped: {
        weapon: "weapon",
        armor: "armor",
        boots: "boots",
        ring: "ring",
        necklace: "necklace",
      },
    });

    expect(effects.baseStatPct.str).toBe(18);
    expect(effects.flat.atk).toBe(100);
    expect(effects.flat.maxHp).toBe(500);
    expect(effects.flat.maxMp).toBe(500);
    expect(effects.flat.evasion).toBe(40);
    expect(effects.flat.speed).toBe(20);
    expect(effects.pct.atk).toBe(9);
    expect(effects.pct.maxHp).toBe(9);
    expect(effects.combat.damageTakenReductionPct).toBe(6);
    expect(effects.combat.finalEvasionEffectPp).toBe(5);
    expect(effects.combat.healingOutputPct).toBe(20);
    expect(effects.combat.skillMpCostReductionPct).toBe(10);
    expect(effects.hunt.rareMaterialDropPct).toBe(20);
    expect(effects.craftGoldDiscountPct).toBe(10);
    expect(effects.combat.skillCritDamagePp).toBe(0);
    expect(effects.combat.bossDamagePct).toBe(0);
    expect(effects.hunt.specialMaterialDropPct).toBe(0);
  });

  it("낮은 티어·폭풍 개량·손상된 해방 데이터는 무시한다", () => {
    const effects = deriveEquippedLiberationEffects({
      owned: [
        {
          iid: "low-tier",
          id: "v2_iron_sword",
          liberation: rankOneLiberation([{ id: "physical_attack_flat" }]),
        },
        {
          iid: "storm-refined",
          id: "v2_storm_wreckage_armor",
          stormRefined: true,
          liberation: rankOneLiberation([{ id: "max_hp_pct" }]),
        },
        {
          iid: "damaged",
          id: "v2_storm_wreckage_boots",
          liberation: {
            rank: 1,
            lineCount: 2,
            revision: 1,
            options: [{ id: "evasion_flat", level: 20 }],
          },
        },
      ],
      equipped: {
        weapon: "low-tier",
        armor: "storm-refined",
        boots: "damaged",
      },
    });

    expect(effects.flat.atk).toBe(0);
    expect(effects.pct.maxHp).toBe(0);
    expect(effects.flat.evasion).toBe(0);
  });
});
