import {
  applyEvasionDamageReduction,
  cappedDefReductionPct,
  EVASION_DAMAGE_REDUCTION_MAX_PCT,
  pvpEvasionDamageReductionPct,
} from "@/adventure/data/v2/v2CombatConstants";
import {
  applyPlayerPoisonDamageScaling,
  damageBetween,
  decrementTimedBuffs,
  rollAttackCount,
  v2DefBuffMult,
  type V2SkillDotApply,
} from "./combatShared";
import { reducedMagicDefense } from "./engine.damageHelpers";
import { type PvPBattleState, type PvPSide, type PvPSideBuffs } from "./engine.pvpState";
import { type PlayerCombat } from "./engineState";
import { effectiveMutationDef } from "./mutationCombat";

export function effectivePvPAccuracyRating(side: PvPSide): number {
  const baseAccuracy = side.player.accRating ?? side.player.accuracyPct ?? 0;
  const accuracyDownPct =
    side.stacks.accuracyDownTurns > 0 ? side.stacks.accuracyDownPct : 0;
  return Math.max(
    0,
    baseAccuracy *
      (1 - Math.min(100, Math.max(0, accuracyDownPct)) / 100),
  );
}



export function playerPvpEvasionReductionPct(
  state: PvPBattleState,
  who: "p1" | "p2",
): number {
  const actor = state[who];
  const opponent = state[who === "p1" ? "p2" : "p1"];
  const luckEvadeBonus = actor.flags.luckyBuffActive
    ? actor.player.doubleLuck?.evade ?? 0
    : 0;
  const temporaryEvasionIncreasePct =
    luckEvadeBonus +
    (actor.player.universalLuckBonusPct ?? 0) +
    actor.buffs.cyclingChiBonus +
    (actor.stacks.skillEvasionTurns > 0 ? actor.stacks.skillEvasionPct : 0);
  const precisionMult = opponent.player.precisionEvasionMult ?? 1;
  const evasionRating = Math.max(
    0,
    (actor.player.evaRating ?? actor.player.evasionPct ?? 0) *
      precisionMult *
      (1 + Math.max(0, temporaryEvasionIncreasePct) / 100),
  );
  return Math.min(
    EVASION_DAMAGE_REDUCTION_MAX_PCT,
    pvpEvasionDamageReductionPct(
      evasionRating,
      effectivePvPAccuracyRating(opponent),
    ) + Math.max(0, actor.player.finalEvasionReductionPctAdd ?? 0),
  );
}



export function mitigatePvPReflectDamage(
  state: PvPBattleState,
  recipientKey: "p1" | "p2",
  reflectorKey: "p1" | "p2",
  rawDamage: number,
): number {
  if (rawDamage <= 0) return 0;
  const recipient = state[recipientKey];
  const reflector = state[reflectorKey];
  const defMult = v2DefBuffMult(
    recipient.v2SelfBuffs,
    recipient.v2SelfDebuffs,
  );
  const effectiveDef = attackerFacingDef(reflector, recipient);
  const defenseDamage = damageBetween(
    rawDamage,
    defMult !== 1 ? Math.floor(effectiveDef * defMult) : effectiveDef,
  );
  const evasionDamage = applyEvasionDamageReduction(
    rawDamage,
    playerPvpEvasionReductionPct(state, recipientKey),
  );
  return Math.min(defenseDamage, evasionDamage);
}



// 공격자가 마주하는 방어자의 effective DEF — analysis 누적 페널티(자기 측 buffs 에 기록) 차감.
// armorPierceFraction 비례 관통 적용. 분쇄/암살/약점은 호출 측에서 별도 처리.
// 약점 노출 (attacker 측 enemyDefDebuffPct) 활성 시 위 모든 감산 후 비례 차감.
// 광기 (defender 측 playerDefDebuffPct) 활성 시 방어자 자신의 effective DEF 더 깎임.
export function attackerFacingDef(
  attacker: PvPSide,
  defender: PvPSide,
  // 발동턴 AP 시한부 버프(약점 노출 등) 적용을 위해 attacker buffs 를 별도 인자로 받을 수 있음.
  // 호출 측에서 시한부 버프가 반영된 buffs 를 전달(없으면 attacker.buffs).
  attackerBuffs: PvPSideBuffs = attacker.buffs,
): number {
  const braceDefBonus = defender.stacks.braceDefBonus ?? 0;
  const raw = Math.max(
    0,
    effectiveMutationDef(
      defender.player.def + braceDefBonus,
      defender.stacks.mutationWeight,
      defender.player.stoneskinDefPctPerWeight ?? 0,
    ) - attackerBuffs.opponentDefPenalty,
  );
  const frac = attacker.player.armorPierceFraction ?? 0;
  let afterPierce = frac > 0 ? Math.round(raw * (1 - frac)) : raw;
  const physicalReductionPct = cappedDefReductionPct(
    defender.buffs.playerDefDebuffTurnsLeft > 0
      ? defender.buffs.playerDefDebuffPct
      : 0,
    attackerBuffs.enemyDefDebuffTurnsLeft > 0
      ? attackerBuffs.enemyDefDebuffPct
      : 0,
    attacker.player.enemyPhysicalDefReductionPct ?? 0,
    sideHasDot(defender, "poison")
      ? attacker.player.poisonedEnemyDefReductionPct ?? 0
      : 0,
  );
  if (physicalReductionPct > 0) {
    afterPierce = Math.round(
      afterPierce * (1 - physicalReductionPct / 100),
    );
  }
  return Math.max(0, afterPierce);
}



// AP 지속 효과 라운드 카운터 -1. 새 attacker 페이즈 진입 시 호출.
// pct/mult 값은 그대로 두지만 turnsLeft 가 0 이면 적용 쪽에서 무시.
export function decrementTimedEffects(buffs: PvPSideBuffs): PvPSideBuffs {
  return decrementTimedBuffs(buffs);
}



// 공격자가 가하는 effective ATK — analysis 페널티는 방어자 측 buffs 에 기록 (이 사이드의 적이 나에게
// 적용한 페널티). 그래서 effectiveAtk = attacker.atk - defender.buffs.opponentAtkPenalty.
// 자신 ATK + 광기(AP 시한부 ATK 버프) — 분신·난무·반사회피 raw 추정용 헬퍼.
export function attackerAtkWithMadness(attacker: PvPSide): number {
  const buffPct =
    attacker.buffs.playerAtkBuffTurnsLeft > 0 ? attacker.buffs.playerAtkBuffPct : 0;
  const bonus = buffPct > 0 ? Math.floor((attacker.player.atk * buffPct) / 100) : 0;
  return attacker.player.atk + bonus;
}



export function effectiveAttackerAtk(attacker: PvPSide, defender: PvPSide): number {
  return Math.max(
    0,
    attackerAtkWithMadness(attacker) +
      attacker.buffs.rampageAtkBonus -
      defender.buffs.opponentAtkPenalty,
  );
}



export function sideHasDot(side: PvPSide, tag: import("./combatShared").V2DotTag): boolean {
  return side.v2Dots.some((d) => d.tag === tag && d.stacks > 0 && d.turns > 0);
}



export function skillTargetDef(attacker: PvPSide, defender: PvPSide): number {
  // 평타와 같은 방어 관통·전투 중 페널티·상시 감소·부식을 그대로 사용한다.
  // attackerFacingDef 가 부식을 이미 적용하므로 이 경로에서 다시 감산하지 않는다.
  return attackerFacingDef(attacker, defender);
}



export function skillTargetMagicDef(attacker: PvPSide, defender: PvPSide): number {
  const base = defender.player.magicDef ?? defender.player.def;
  const reductionPct = cappedDefReductionPct(
    (attacker.buffs.enemyMagicDefDebuffTurnsLeft ?? 0) > 0
      ? attacker.buffs.enemyMagicDefDebuffPct ?? 0
      : 0,
    attacker.player.enemyMagicDefReductionPct ?? 0,
  );
  return reducedMagicDefense(
    base,
    reductionPct,
  );
}



export function applyPoisonDamageToDots(
  dots: readonly V2SkillDotApply[],
  player: PlayerCombat,
): V2SkillDotApply[] {
  return applyPlayerPoisonDamageScaling(dots, player.poisonDamagePct);
}



export function rollPvPAttackCount(attacker: PvPSide, defender: PvPSide): number {
  const bonus = attacker.player.extraAttackChancePctWhileEnemyBleeding ?? 0;
  if (bonus <= 0 || !sideHasDot(defender, "bleed")) {
    return rollAttackCount(attacker.player);
  }
  return rollAttackCount({
    ...attacker.player,
    extraAttackChancePct: (attacker.player.extraAttackChancePct ?? 0) + bonus,
  });
}
