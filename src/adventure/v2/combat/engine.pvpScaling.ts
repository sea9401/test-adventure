import type { PvPBattleState } from "./engine-pvp";

type PvPDamageScaleState = Pick<PvPBattleState, "damageMultiplier">;
type PvPSustainScaleState = Pick<PvPBattleState, "sustainMultiplier">;

export function scalePvPDamage(
  state: PvPDamageScaleState,
  damage: number,
): number {
  if (damage <= 0) return damage;
  const multiplier = state.damageMultiplier ?? 1;
  if (multiplier === 1) return damage;
  return Math.max(1, Math.floor(damage * multiplier));
}

export function scalePositivePvPValue(value: number, multiplier = 1): number {
  if (value <= 0 || multiplier === 1) return value;
  return Math.max(1, Math.floor(value * multiplier));
}

export function scalePvPHealing(
  state: PvPSustainScaleState,
  healing: number,
): number {
  return scalePositivePvPValue(healing, state.sustainMultiplier);
}

export function scalePvPShield(
  state: PvPSustainScaleState,
  shield: number,
): number {
  return scalePositivePvPValue(shield, state.sustainMultiplier);
}
