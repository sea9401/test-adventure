import type {
  Monster,
  MonsterPhaseTrigger,
  MonsterSkill,
} from "@/adventure/data/monsters/types";
import type { PlayerCombat } from "@/adventure/v2/combat/engineState";

export const V2_COMBAT_NUMBER_SCALE = 3;

export function scaleCombatNumber(value: number): number {
  return Math.max(0, Math.round(value * V2_COMBAT_NUMBER_SCALE));
}

export function scaleSavedHpToCurrent(rawHp: number, savedScale: unknown): number {
  const fromScale =
    typeof savedScale === "number" &&
    Number.isFinite(savedScale) &&
    savedScale > 0
      ? savedScale
      : 1;
  if (fromScale === V2_COMBAT_NUMBER_SCALE) {
    return Math.max(0, Math.floor(rawHp));
  }
  return Math.max(0, Math.round((rawHp * V2_COMBAT_NUMBER_SCALE) / fromScale));
}

function scaleMonsterSkill(
  skill: MonsterSkill | undefined,
): MonsterSkill | undefined {
  if (!skill) return undefined;
  if (skill.kind === "enrage") {
    return { ...skill, atkBonus: scaleCombatNumber(skill.atkBonus) };
  }
  if (skill.kind === "brace") {
    return {
      ...skill,
      damageReduction: scaleCombatNumber(skill.damageReduction),
    };
  }
  if (skill.kind === "pierce") {
    return { ...skill, armorPierce: scaleCombatNumber(skill.armorPierce) };
  }
  if (skill.kind === "chill") {
    return { ...skill, dmgPerStack: scaleCombatNumber(skill.dmgPerStack) };
  }
  if (skill.kind === "curse") {
    return { ...skill, dmgPerStack: scaleCombatNumber(skill.dmgPerStack) };
  }
  return skill;
}

function scalePhaseTrigger(
  trigger: MonsterPhaseTrigger | undefined,
): MonsterPhaseTrigger | undefined {
  return trigger
    ? { ...trigger, defBonus: scaleCombatNumber(trigger.defBonus) }
    : undefined;
}

export function scaleMonsterCombatNumbers(monster: Monster): Monster {
  if (monster.combatNumberScale === V2_COMBAT_NUMBER_SCALE) return monster;
  return {
    ...monster,
    hp: scaleCombatNumber(monster.hp),
    atk: scaleCombatNumber(monster.atk),
    def: scaleCombatNumber(monster.def),
    ...(monster.skill ? { skill: scaleMonsterSkill(monster.skill) } : {}),
    ...(monster.phaseTrigger
      ? { phaseTrigger: scalePhaseTrigger(monster.phaseTrigger) }
      : {}),
    combatNumberScale: V2_COMBAT_NUMBER_SCALE,
  };
}

export function scalePlayerCombatNumbers(player: PlayerCombat): PlayerCombat {
  if (player.combatNumberScale === V2_COMBAT_NUMBER_SCALE) return player;
  return {
    ...player,
    hp: scaleCombatNumber(player.hp),
    maxHp: scaleCombatNumber(player.maxHp),
    atk: scaleCombatNumber(player.atk),
    magicAtk:
      player.magicAtk == null
        ? player.magicAtk
        : scaleCombatNumber(player.magicAtk),
    def: scaleCombatNumber(player.def),
    magicDef:
      player.magicDef == null
        ? player.magicDef
        : scaleCombatNumber(player.magicDef),
    minDamage:
      player.minDamage == null
        ? player.minDamage
        : scaleCombatNumber(player.minDamage),
    powerAttackBonus:
      player.powerAttackBonus == null
        ? player.powerAttackBonus
        : scaleCombatNumber(player.powerAttackBonus),
    crushDefReduction:
      player.crushDefReduction == null
        ? player.crushDefReduction
        : scaleCombatNumber(player.crushDefReduction),
    counterAtkBonus:
      player.counterAtkBonus == null
        ? player.counterAtkBonus
        : scaleCombatNumber(player.counterAtkBonus),
    evadeHealAmount:
      player.evadeHealAmount == null
        ? player.evadeHealAmount
        : scaleCombatNumber(player.evadeHealAmount),
    guard: player.guard
      ? {
          ...player.guard,
          reduction: scaleCombatNumber(player.guard.reduction),
        }
      : player.guard,
    regen: player.regen
      ? { ...player.regen, amount: scaleCombatNumber(player.regen.amount) }
      : player.regen,
    bulwarkShield:
      player.bulwarkShield == null
        ? player.bulwarkShield
        : scaleCombatNumber(player.bulwarkShield),
    gustAtkPerAttack:
      player.gustAtkPerAttack == null
        ? player.gustAtkPerAttack
        : scaleCombatNumber(player.gustAtkPerAttack),
    thornsFlatFromDef:
      player.thornsFlatFromDef == null
        ? player.thornsFlatFromDef
        : scaleCombatNumber(player.thornsFlatFromDef),
    steadfastWillFlat:
      player.steadfastWillFlat == null
        ? player.steadfastWillFlat
        : scaleCombatNumber(player.steadfastWillFlat),
    enchantPierceFlat:
      player.enchantPierceFlat == null
        ? player.enchantPierceFlat
        : scaleCombatNumber(player.enchantPierceFlat),
    bleedOnHit: player.bleedOnHit
      ? {
          ...player.bleedOnHit,
          flatPerStack: scaleCombatNumber(player.bleedOnHit.flatPerStack),
        }
      : player.bleedOnHit,
    combatNumberScale: V2_COMBAT_NUMBER_SCALE,
  };
}
