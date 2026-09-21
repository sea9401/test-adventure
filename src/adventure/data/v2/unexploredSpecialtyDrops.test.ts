import { describe, expect, it } from "vitest";
import { buildUnexploredRewardPlan, rollUnexploredHuntRewards } from "./unexploredHuntRewards";
import { UNEXPLORED_MONSTER_POOLS, type UnexploredPoolId } from "./unexploredMonsterPools";
import { unexploredMonsterAtDifficulty } from "./unexploredMonsters";
import { UNEXPLORED_SPECIALTY_EQUIPMENT_IDS } from "./unexploredSpecialtyEquipment";
import { deriveUnexploredEffects } from "./unexploredTree";
import { emptyEquippedLiberationEffects } from "./equipmentLiberationEffects";

// Literal expectations from the approved 36-monster design, independent of drop routing.
const rows = [
  ["iron_legion", "armored_shieldman", "v2_unexplored_iron_line_armor"],
  ["iron_legion", "armored_spearman", "v2_unexplored_iron_line_gloves"],
  ["iron_legion", "armored_crusher", "v2_unexplored_iron_line_boots"],
  ["mana_barrier", "barrier_guardian", "v2_unexplored_mana_barrier_armor"],
  ["mana_barrier", "rune_executor", "v2_unexplored_mana_barrier_ring"],
  ["mana_barrier", "seal_watcher", "v2_unexplored_mana_barrier_necklace"],
  ["regenerating_swarm", "regenerating_spore", "v2_unexplored_regrowth_colony_armor"],
  ["regenerating_swarm", "devouring_regenerator", "v2_unexplored_regrowth_colony_gloves"],
  ["regenerating_swarm", "proliferating_core", "v2_unexplored_regrowth_colony_necklace"],
  ["red_berserkers", "red_berserker", "v2_unexplored_battle_revenge_gloves"],
  ["red_berserkers", "blood_duelist", "v2_unexplored_battle_revenge_boots"],
  ["red_berserkers", "red_executioner", "v2_unexplored_battle_revenge_ring"],
  ["crystal_artillery", "crystal_mage", "v2_unexplored_crystal_barrage_armor"],
  ["crystal_artillery", "refraction_artillery", "v2_unexplored_crystal_barrage_gloves"],
  ["crystal_artillery", "crystal_sentinel", "v2_unexplored_crystal_barrage_necklace"],
  ["precision_hunters", "precision_scout", "v2_unexplored_precision_hunt_boots"],
  ["precision_hunters", "lethal_sniper", "v2_unexplored_precision_hunt_ring"],
  ["precision_hunters", "armor_hunter", "v2_unexplored_precision_hunt_gloves"],
  ["runaway_machines", "rushing_machine", "v2_unexplored_chain_drive_boots"],
  ["runaway_machines", "combo_automaton", "v2_unexplored_chain_drive_gloves"],
  ["runaway_machines", "overheated_enforcer", "v2_unexplored_chain_drive_ring"],
  ["shadow_stalkers", "shadow_scout", "v2_unexplored_afterimage_hunt_boots"],
  ["shadow_stalkers", "night_assassin", "v2_unexplored_afterimage_hunt_gloves"],
  ["shadow_stalkers", "phantom_stalker", "v2_unexplored_afterimage_hunt_armor"],
  ["venom_colony", "venom_fang_devourer", "v2_unexplored_triad_decay_gloves"],
  ["venom_colony", "venom_sprayer", "v2_unexplored_triad_decay_ring"],
  ["venom_colony", "corrosive_colony", "v2_unexplored_triad_decay_armor"],
  ["bloodstained_dead", "hooked_dead", "v2_unexplored_unyielding_dead_gloves"],
  ["bloodstained_dead", "bloodtrail_pursuer", "v2_unexplored_unyielding_dead_boots"],
  ["bloodstained_dead", "severing_executioner", "v2_unexplored_unyielding_dead_armor"],
  ["frozen_legion", "frost_toucher", "v2_unexplored_freezing_lock_gloves"],
  ["frozen_legion", "freezing_mage", "v2_unexplored_freezing_lock_ring"],
  ["frozen_legion", "frozen_sentinel", "v2_unexplored_freezing_lock_armor"],
  ["crushing_colossi", "bedrock_colossus", "v2_unexplored_crushing_pressure_armor"],
  ["crushing_colossi", "ironwall_crusher", "v2_unexplored_crushing_pressure_gloves"],
  ["crushing_colossi", "crust_destroyer", "v2_unexplored_crushing_pressure_boots"],
] as const;

function monster(poolId: UnexploredPoolId, monsterId: string, focused = false) {
  return unexploredMonsterAtDifficulty({ source: "special", poolId, monsterId, focused, difficulty: 95 });
}

describe("미개척지 특화 장비 드랍 (#702)", () => {
  it("covers every active monster and every specialty item exactly once", () => {
    expect(rows.map(([, id]) => id).sort()).toEqual(
      UNEXPLORED_MONSTER_POOLS.flatMap(pool => pool.activeMonsters.map(m => m.id)).sort(),
    );
    expect(rows.map(([, , id]) => id).sort()).toEqual([...UNEXPLORED_SPECIALTY_EQUIPMENT_IDS].sort());
  });

  it.each(rows)("%s / %s drops only %s at normal and focused boundaries", (poolId, monsterId, equipmentId) => {
    // Catches removed routing, wrong per-monster mapping and inclusive boundaries.
    for (const [focused, hit, miss] of [[false, 0.003999, 0.004], [true, 0.005999, 0.006]] as const) {
      const plan = buildUnexploredRewardPlan(monster(poolId, monsterId, focused), deriveUnexploredEffects([]));
      const result = rollUnexploredHuntRewards(plan, () => hit);
      expect(result.droppedEquipments).toEqual([equipmentId]);
      expect(result.grants).toContainEqual({ kind: "equipment", id: equipmentId, amount: 1, tag: "special", source: "unexplored_monster_drop" });
      expect(rollUnexploredHuntRewards(plan, () => miss).droppedEquipments).toEqual([]);
    }
  });

  it("does not multiply or copy specialty equipment with common/rare rewards or liberation", () => {
    for (const bonus of [-100, 500]) {
      const effects = deriveUnexploredEffects([]);
      effects.rewardPct.equipment = bonus;
      effects.rewardPct.rare = bonus;
      effects.poolLootPctByPool.iron_legion = bonus;
      effects.rareCopyChancePct = 100;
      const plan = buildUnexploredRewardPlan(monster("iron_legion", "armored_shieldman"), effects, {
        ...emptyEquippedLiberationEffects().hunt, equipmentDropPct: 500,
      });
      expect(rollUnexploredHuntRewards(plan, () => 0.003999).droppedEquipments).toEqual(["v2_unexplored_iron_line_armor"]);
      expect(rollUnexploredHuntRewards(plan, () => 0.004).droppedEquipments).toEqual([]);
    }
  });

  it("can award the specialty item alongside common gear, a pioneer weapon and materials", () => {
    const plan = buildUnexploredRewardPlan(monster("iron_legion", "armored_shieldman"), deriveUnexploredEffects([]));
    const result = rollUnexploredHuntRewards(plan, () => 0, {
      common: { gold: 100, drops: {}, droppedEquipments: ["v2_iron_sword"], droppedUniques: [] },
    });
    expect(result.droppedEquipments).toEqual(["v2_iron_sword", "v2_unexplored_iron_line_armor"]);
    expect(result.droppedUniques).toEqual(["v2_pioneer_ironstar_greatsword"]);
    expect(result.drops).toMatchObject({ v2_unexplored_iron_legion_material: 1, sp_fruit_6: 1 });
  });

  it("does not award specialty gear to base monsters even when focused pools are selected", () => {
    const base = unexploredMonsterAtDifficulty({ source: "base", poolId: null, focused: false, difficulty: 95 });
    const effects = deriveUnexploredEffects(["start", "pool-iron_legion", "enh-iron_legion-focus"]);
    expect(rollUnexploredHuntRewards(buildUnexploredRewardPlan(base, effects), () => 0).droppedEquipments).toEqual([]);
  });
});
