import type { PlayerCombat } from "./engineState";
/** ATK 보정과 별개로 활력 버프를 적용한다. 반사 증폭과 상대 방어 계산 전에 더한다. */
export function martialCounterVitality(player: PlayerCombat, vitMultiplier = 1): number {
  return Math.floor(Math.max(0, player.vitStat ?? 0) * Math.max(0, player.passiveCounterVitCoef ?? 0) * Math.max(0, vitMultiplier));
}
export function canMartialCounterHit(player: PlayerCombat, hpDamage: number, shieldDamage: number, barrierDamage = 0): boolean {
  return hpDamage > 0 || ((player.passiveCounterVitCoef ?? 0) > 0 && shieldDamage + barrierDamage > 0);
}
