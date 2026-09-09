import { applyPlayerPoisonDamageScaling, makePoisonDot } from "./combatShared";
import { type V2Dot } from "./combatDots";
import { type PlayerCombat } from "./engineState";

/** 장비·적중 독도 스킬 독과 같은 행운 기준 및 최종 맹독 보정을 한 번 적용한다. */
export function makePlayerPoisonDot(
  args: Omit<Parameters<typeof makePoisonDot>[0], "sourceAtk">,
  player: Pick<PlayerCombat, "atk" | "lukStat" | "poisonDamagePct">,
): V2Dot {
  return applyPlayerPoisonDamageScaling([
    makePoisonDot({ ...args, sourceAtk: Math.max(player.atk, player.lukStat ?? 0) }),
  ], player.poisonDamagePct)[0];
}

/** 시전 시 새로 만든 DoT에 시전자의 피해 보너스를 한 번 적용한다. */
export function applyPlayerDotDamageBonuses(
  dots: readonly V2Dot[],
  poisonDamagePct = 0,
  burnDamagePct = 0,
  burnDurationBonusTurns = 0,
  statusDotDamagePct = 0,
): V2Dot[] {
  const scaled = applyPlayerPoisonDamageScaling(dots, poisonDamagePct);
  const burnMult = 1 + Math.max(0, burnDamagePct) / 100;
  const periodicMult = 1 + Math.max(0, statusDotDamagePct) / 100;
  const extraTurns = Math.max(0, Math.floor(burnDurationBonusTurns));
  if (burnMult === 1 && periodicMult === 1 && extraTurns === 0) return scaled;
  return scaled.map(dot => ({
    ...dot,
    ...(dot.tag === "burn" ? { turns: dot.turns + extraTurns } : {}),
    ...(dot.tag === "burn" && burnMult !== 1
      ? { finalDamageMult: (dot.finalDamageMult ?? 1) * burnMult }
      : {}),
    ...(periodicMult !== 1 ? { periodicDamageMult: (dot.periodicDamageMult ?? 1) * periodicMult } : {}),
  }));
}

export function applyDotDamageToDots(dots: readonly V2Dot[], player: PlayerCombat): V2Dot[] {
  return applyPlayerDotDamageBonuses(dots, player.poisonDamagePct, player.burnDamagePct, player.burnDurationBonusTurns, player.statusDotDamagePct);
}
