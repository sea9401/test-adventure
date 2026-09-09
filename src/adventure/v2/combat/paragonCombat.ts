import { V2_SKILLS, type V2SkillId } from "@/adventure/data/v2/v2Skills";
import { composeDuelistDeclaration, interruptDuelistRamp, type DuelistBuff, type DuelistBasicHitModifiers } from "./duelistCombat";
import { type PlayerCombat } from "./engineState";

export function resolveDeclarationCast(
  equipped: readonly V2SkillId[],
  castId: V2SkillId | null,
  previous: DuelistBuff | null | undefined,
) {
  const declaration = castId ? composeDuelistDeclaration(equipped, castId) : null;
  const mastery = equipped.some(id => V2_SKILLS[id]?.passive?.paragonMastery);
  const preserveRamp = mastery && castId && V2_SKILLS[castId]?.category === "attack";
  return {
    declaration,
    buff: declaration ?? (
      castId && !preserveRamp ? interruptDuelistRamp(previous) : previous
    ),
    extraActions: declaration && mastery ? 1 : 0,
  };
}

export function paragonBasicBonus(
  player: PlayerCombat,
  attackPower: number,
  modifiers: DuelistBasicHitModifiers,
): number {
  if (!modifiers.basicAllStatCoef) return 0;
  const stats = [
    player.strStat, player.vitStat, player.dexStat,
    player.intStat, player.spiStat, player.lukStat,
  ];
  const total = player.allStatTotal ?? stats.reduce<number>(
    (sum, value) => sum + Math.max(0, value ?? 0), 0,
  );
  const bonus = total * modifiers.basicAllStatCoef;
  const cap = attackPower * (modifiers.basicAllStatAtkCapPct ?? 0) / 100;
  return Math.floor(Math.max(0, Math.min(bonus, cap)));
}

export function applyNextAttackDamageDown(damage: number, pct = 0): number {
  return damage > 0 && pct > 0
    ? Math.max(1, Math.floor(damage * (1 - Math.min(100, pct) / 100)))
    : damage;
}

export function consumeNextAttackDamageDown(
  stacks: { nextAttackDamageDownPct?: number },
  landed: boolean,
) {
  return landed && stacks.nextAttackDamageDownPct != null
    ? { nextAttackDamageDownPct: 0 }
    : {};
}

export function nextAttackDamageDownApplication(
  effect: { pct: number; nextAttackOnly?: boolean } | undefined,
  landed: boolean,
) {
  return effect?.nextAttackOnly && landed
    ? { nextAttackDamageDownPct: effect.pct }
    : {};
}
