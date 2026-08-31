import { V2_STAT_KEYS, type V2StatKey } from "./v2StatKeys";
import {
  V2_EQUIPMENT,
  parseEquipmentSave,
  type V2EquipInstance,
} from "./v2Equipment";
import {
  canLiberateEquipment,
  liberationOptionValue,
} from "./equipmentLiberation";
import type { LiberationOptionId } from "./equipmentLiberationCatalog";

export type LiberationHuntEffects = {
  goldPct: number;
  expPct: number;
  equipmentDropPct: number;
  normalMaterialDropPct: number;
  specialMaterialDropPct: number;
  rareMaterialDropPct: number;
  rareMapAndSummonScrollDropPct: number;
  minimumEquipmentQualityPp: number;
  postHuntHpRestorePct: number;
  postHuntMpRestorePct: number;
};

export type LiberationGrowthEffects = {
  levelUpMaxHpGrowth: number;
  levelUpMaxMpGrowth: number;
};

export type LiberationHuntSnapshot = Readonly<{
  effects: Readonly<LiberationHuntEffects>;
  growth: Readonly<LiberationGrowthEffects>;
  postHuntHpRestorePct: number;
  postHuntMpRestorePct: number;
}>;

export type EquippedLiberationEffects = {
  baseStatPct: Partial<Record<V2StatKey, number>>;
  flat: {
    atk: number;
    magicAtk: number;
    physicalDef: number;
    magicDef: number;
    maxHp: number;
    maxMp: number;
    accuracy: number;
    evasion: number;
    speed: number;
  };
  pct: {
    atk: number;
    magicAtk: number;
    physicalDef: number;
    magicDef: number;
    maxHp: number;
    allDamage: number;
  };
  combat: {
    critChancePp: number;
    critDamagePp: number;
    skillCritDamagePp: number;
    critResistPp: number;
    statusDamageReductionPct: number;
    physicalPenetrationPct: number;
    magicPenetrationPct: number;
    bossDamagePct: number;
    damageTakenReductionPct: number;
    shieldMaxHpPct: number;
    receivedHealingPct: number;
    healingOutputPct: number;
    skillMpCostReductionPct: number;
    finalEvasionEffectPp: number;
  };
  hunt: LiberationHuntEffects;
  growth: LiberationGrowthEffects;
  craftGoldDiscountPct: number;
};

export function emptyEquippedLiberationEffects(): EquippedLiberationEffects {
  return {
    baseStatPct: {},
    flat: {
      atk: 0,
      magicAtk: 0,
      physicalDef: 0,
      magicDef: 0,
      maxHp: 0,
      maxMp: 0,
      accuracy: 0,
      evasion: 0,
      speed: 0,
    },
    pct: {
      atk: 0,
      magicAtk: 0,
      physicalDef: 0,
      magicDef: 0,
      maxHp: 0,
      allDamage: 0,
    },
    combat: {
      critChancePp: 0,
      critDamagePp: 0,
      skillCritDamagePp: 0,
      critResistPp: 0,
      statusDamageReductionPct: 0,
      physicalPenetrationPct: 0,
      magicPenetrationPct: 0,
      bossDamagePct: 0,
      damageTakenReductionPct: 0,
      shieldMaxHpPct: 0,
      receivedHealingPct: 0,
      healingOutputPct: 0,
      skillMpCostReductionPct: 0,
      finalEvasionEffectPp: 0,
    },
    hunt: {
      goldPct: 0,
      expPct: 0,
      equipmentDropPct: 0,
      normalMaterialDropPct: 0,
      specialMaterialDropPct: 0,
      rareMaterialDropPct: 0,
      rareMapAndSummonScrollDropPct: 0,
      minimumEquipmentQualityPp: 0,
      postHuntHpRestorePct: 0,
      postHuntMpRestorePct: 0,
    },
    growth: { levelUpMaxHpGrowth: 0, levelUpMaxMpGrowth: 0 },
    craftGoldDiscountPct: 0,
  };
}

function freezeHuntSnapshot(
  hunt: LiberationHuntEffects,
  growth: LiberationGrowthEffects,
): LiberationHuntSnapshot {
  const effects = Object.freeze({ ...hunt });
  return Object.freeze({
    effects,
    growth: Object.freeze({ ...growth }),
    postHuntHpRestorePct: effects.postHuntHpRestorePct,
    postHuntMpRestorePct: effects.postHuntMpRestorePct,
  });
}

const emptySnapshotEffects = emptyEquippedLiberationEffects();
export const EMPTY_LIBERATION_HUNT_SNAPSHOT = freezeHuntSnapshot(
  emptySnapshotEffects.hunt,
  emptySnapshotEffects.growth,
);

function addBaseStat(
  effects: EquippedLiberationEffects,
  stat: V2StatKey,
  value: number,
): void {
  effects.baseStatPct[stat] = (effects.baseStatPct[stat] ?? 0) + value;
}

function addOption(
  effects: EquippedLiberationEffects,
  id: LiberationOptionId,
  value: number,
): void {
  switch (id) {
    case "base_str_pct": return addBaseStat(effects, "str", value);
    case "base_dex_pct": return addBaseStat(effects, "dex", value);
    case "base_vit_pct": return addBaseStat(effects, "vit", value);
    case "base_int_pct": return addBaseStat(effects, "int", value);
    case "base_spi_pct": return addBaseStat(effects, "spi", value);
    case "base_luk_pct": return addBaseStat(effects, "luk", value);
    case "physical_attack_flat": effects.flat.atk += value; return;
    case "magic_attack_flat": effects.flat.magicAtk += value; return;
    case "physical_attack_pct": effects.pct.atk += value; return;
    case "magic_attack_pct": effects.pct.magicAtk += value; return;
    case "physical_defense_flat": effects.flat.physicalDef += value; return;
    case "magic_defense_flat": effects.flat.magicDef += value; return;
    case "physical_defense_pct": effects.pct.physicalDef += value; return;
    case "magic_defense_pct": effects.pct.magicDef += value; return;
    case "physical_penetration_pct": effects.combat.physicalPenetrationPct += value; return;
    case "magic_penetration_pct": effects.combat.magicPenetrationPct += value; return;
    case "max_hp_flat": effects.flat.maxHp += value; return;
    case "max_mp_flat": effects.flat.maxMp += value; return;
    case "max_hp_pct": effects.pct.maxHp += value; return;
    case "accuracy_flat": effects.flat.accuracy += value; return;
    case "evasion_flat": effects.flat.evasion += value; return;
    case "final_evasion_effect_pp": effects.combat.finalEvasionEffectPp += value; return;
    case "speed_flat": effects.flat.speed += value; return;
    case "crit_chance_pp": effects.combat.critChancePp += value; return;
    case "crit_damage_pp": effects.combat.critDamagePp += value; return;
    case "skill_crit_damage_pp": effects.combat.skillCritDamagePp += value; return;
    case "crit_resist_pp": effects.combat.critResistPp += value; return;
    case "status_damage_reduction_pct": effects.combat.statusDamageReductionPct += value; return;
    case "all_damage_pct": effects.pct.allDamage += value; return;
    case "boss_damage_pct": effects.combat.bossDamagePct += value; return;
    case "damage_taken_reduction_pct": effects.combat.damageTakenReductionPct += value; return;
    case "battle_start_shield_max_hp_pct": effects.combat.shieldMaxHpPct += value; return;
    case "healing_received_pct": effects.combat.receivedHealingPct += value; return;
    case "healing_output_pct": effects.combat.healingOutputPct += value; return;
    case "skill_mp_cost_reduction_pct": effects.combat.skillMpCostReductionPct += value; return;
    case "post_hunt_hp_restore_pct": effects.hunt.postHuntHpRestorePct += value; return;
    case "post_hunt_mp_restore_pct": effects.hunt.postHuntMpRestorePct += value; return;
    case "hunt_gold_pct": effects.hunt.goldPct += value; return;
    case "hunt_exp_pct": effects.hunt.expPct += value; return;
    case "equipment_drop_pct": effects.hunt.equipmentDropPct += value; return;
    case "normal_material_drop_pct": effects.hunt.normalMaterialDropPct += value; return;
    case "special_material_drop_pct": effects.hunt.specialMaterialDropPct += value; return;
    case "rare_material_drop_pct": effects.hunt.rareMaterialDropPct += value; return;
    case "normal_and_special_material_drop_pct":
      effects.hunt.normalMaterialDropPct += value;
      effects.hunt.specialMaterialDropPct += value;
      return;
    case "rare_map_and_summon_scroll_drop_pct": effects.hunt.rareMapAndSummonScrollDropPct += value; return;
    case "minimum_equipment_quality_pp": effects.hunt.minimumEquipmentQualityPp += value; return;
    case "personal_craft_gold_discount_pct": effects.craftGoldDiscountPct += value; return;
    case "level_up_max_hp_growth": effects.growth.levelUpMaxHpGrowth += value; return;
    case "level_up_max_mp_growth": effects.growth.levelUpMaxMpGrowth += value; return;
  }
}

function equippedLiberatedInstances(rawSave: unknown): V2EquipInstance[] {
  const parsed = parseEquipmentSave(rawSave);
  const byIid = new Map(parsed.owned.map((instance) => [instance.iid, instance]));
  return Object.values(parsed.equipped)
    .map((iid) => (iid ? byIid.get(iid) : undefined))
    .filter((instance): instance is V2EquipInstance => {
      if (!instance?.liberation) return false;
      const item = V2_EQUIPMENT[instance.id];
      return canLiberateEquipment(item, instance);
    });
}

export function deriveEquippedLiberationEffects(
  rawSave: unknown,
): EquippedLiberationEffects {
  const effects = emptyEquippedLiberationEffects();
  for (const instance of equippedLiberatedInstances(rawSave)) {
    for (const option of instance.liberation?.options ?? []) {
      addOption(effects, option.id, liberationOptionValue(option.id, option.level));
    }
  }
  return effects;
}

export function deriveLiberationHuntSnapshot(
  rawSave: unknown,
): LiberationHuntSnapshot {
  const effects = deriveEquippedLiberationEffects(rawSave);
  return freezeHuntSnapshot(effects.hunt, effects.growth);
}

export const LIBERATION_BASE_STAT_KEYS = V2_STAT_KEYS;
