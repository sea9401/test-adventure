import { cappedDefReductionPct } from "@/adventure/data/v2/v2CombatConstants";
import { damageBetween } from "./combatShared";
import { reducedMagicDefense } from "./engine.damageHelpers";

function nonNegativeInteger(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

export function effectiveTier6MagicDefense(input: {
  baseDefense: number;
  reductionPcts: readonly number[];
}): number {
  const baseDefense = nonNegativeInteger(input.baseDefense);
  const reductionPct = cappedDefReductionPct(...input.reductionPcts);
  return reducedMagicDefense(baseDefense, reductionPct);
}

export type Tier6MagicDamageInput = {
  rawDamage: number;
  magicDefense: number;
  damageTakenReductionPct?: number;
};

export function tier6MagicDamageAfterMitigation(
  input: Tier6MagicDamageInput,
): number {
  const rawDamage = nonNegativeInteger(input.rawDamage);
  if (rawDamage <= 0) return 0;

  const damageAfterDefense = damageBetween(
    rawDamage,
    nonNegativeInteger(input.magicDefense),
  );
  const reductionPct = Math.min(
    100,
    Math.max(0, Number(input.damageTakenReductionPct) || 0),
  );
  if (reductionPct <= 0) return damageAfterDefense;
  return Math.max(
    1,
    Math.floor(damageAfterDefense * (1 - reductionPct / 100)),
  );
}

export function tier6DamageAfterMultiplier(
  damage: number,
  multiplier = 1,
): number {
  const amount = nonNegativeInteger(damage);
  if (amount <= 0) return 0;
  const safeMultiplier = Number.isFinite(multiplier)
    ? Math.max(0, multiplier)
    : 1;
  if (safeMultiplier === 1) return amount;
  return Math.max(1, Math.floor(amount * safeMultiplier));
}
