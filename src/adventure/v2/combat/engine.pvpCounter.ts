import { recordCombatDamage } from "./combatDiagnostics";
import { effectiveAttackerAtk } from "./engine.pvpStats";
import { combatRandom } from "./combatRandom";
import { attackerFacingDef } from "./engine.pvpStats";
import { setSide } from "./engine.pvpSide";
import { type PvPBattleState } from "./engine.pvpState";
import { dreadnoughtCounterHit } from "./dreadnought";
import { damageBetween, v2AtkBuffMult, v2DefBuffMult } from "./combatShared";
import { appendLog } from "./engineSupport";
import { scalePvPDamage } from "./engine.pvpScaling";
import { magicBarrierCombatLogEntries, resolveMagicBarrierDamage } from "./magicBarrier";
import { finishBerserkerCurrentActionGuard } from "./berserkerCombat";
import { appendPvPSurvivalLogs, resolvePvPHostileDamageSurvival } from "./pvpHostileDamage";

// 무도가/절정 반격 패시브 — 피격 후 일정 확률로 ATK 카운터(반격의 룬과 동일 패턴·별개 누적). PvE
//   enemyPhase 의 passiveCounterChancePct 카운터를 PvP 로 미러. pct 0 이면 RNG 미소비(byte-identical).
export function maybeApplyMartialCounter(
  state: PvPBattleState,
  atkKey: "p1" | "p2",
  defKey: "p1" | "p2",
  finishCurrentAction = true,
): { state: PvPBattleState; attackerKilled: boolean } {
  const defender = state[defKey];
  const attacker = state[atkKey];
  const pct = defender.player.passiveCounterChancePct ?? 0;
  if (defender.hp <= 0 || attacker.hp <= 0 || pct <= 0 || combatRandom() * 100 >= pct) {
    return { state, attackerKilled: false };
  }
  // 반격 데미지도 v2 buff/debuff 격리 해제. defender 가 공격자, attacker 가 방어자(반격 방향).
  const v2AtkMultMC = v2AtkBuffMult(defender.v2SelfBuffs, defender.v2SelfDebuffs);
  const v2DefMultMC = v2DefBuffMult(attacker.v2SelfBuffs, attacker.v2SelfDebuffs);
  const mcAtk = effectiveAttackerAtk(defender, attacker);
  const mcDef = attackerFacingDef(defender, attacker);
  const counterBoostPct =
    defender.player.passiveCounterDamageUsesReflectBoost &&
    defender.stacks.skillReflectBoostTurns > 0
      ? defender.stacks.skillReflectBoostPct
      : 0;
  const counterAtk = v2AtkMultMC !== 1 ? Math.floor(mcAtk * v2AtkMultMC) : mcAtk;
  const boostedCounterAtk =
    counterBoostPct > 0
      ? Math.floor(counterAtk * (1 + counterBoostPct / 100))
      : counterAtk;
  const counterDefense =
    v2DefMultMC !== 1 ? Math.floor(mcDef * v2DefMultMC) : mcDef;
  const counter = dreadnoughtCounterHit({
    state: defender.stacks.dreadnought, impact: defender.stacks.fortressImpact,
    gain: defender.player.counterImpactGain, actionId: defender.stacks.dreadnought?.enemyActionId ?? attacker.turn.completedPlayerTurns + 1, landed: true,
  });
  const barrier = resolveMagicBarrierDamage({
    rawDamage: boostedCounterAtk,
    durability: attacker.magicBarrier ?? 0,
    absorbPct: attacker.player.magicBarrierPvpAbsorbPct,
    efficiencyPct: attacker.player.magicBarrierPvpEfficiencyPct,
    eligible: true,
    mitigateBody: (bodyRawDamage) =>
      scalePvPDamage(state, Math.floor(damageBetween(bodyRawDamage, counterDefense) * counter.damageMult)),
  });
  const dmg = barrier.hpBoundDamage;
  recordCombatDamage("martial_counter", atkKey, attacker.hp, dmg, barrier.absorbedDamage);
  const survival = resolvePvPHostileDamageSurvival(
    { ...attacker, magicBarrier: barrier.durabilityLeft },
    attacker.hp - dmg,
  );
  if (finishCurrentAction && survival.side.berserker) {
    survival.side = {
      ...survival.side,
      berserker: finishBerserkerCurrentActionGuard(
        survival.side.berserker,
      ),
    };
  }
  let st = setSide(state, atkKey, survival.side);
  if (dmg > 0) {
    st = setSide(st, defKey, { ...defender, stacks: {
      ...defender.stacks, fortressImpact: counter.impact,
      ...(counter.state ? { dreadnought: counter.state } : {}),
    } });
  }
  for (const entry of magicBarrierCombatLogEntries(barrier)) {
    st = {
      ...st,
      log: appendLog(st.log, { ...entry, side: atkKey }),
    };
  }
  st = {
    ...st,
    log: appendLog(st.log, {
      kind: "player_attack",
      text: `[${counterBoostPct > 0 ? "반격 + 금강인" : "반격"}${counter.damageMult > 1 ? " + 시즈 브레이커" : ""}] ${attacker.name}에게 ${dmg} 반격 피해.`,
    }),
  };
  st = appendPvPSurvivalLogs(st, atkKey, attacker.name, survival);
  if (survival.side.hp <= 0) {
    st = {
      ...st,
      log: appendLog(st.log, {
        kind: "info",
        text: `${attacker.name}이(가) 쓰러졌다.`,
      }),
      phase: "ended",
      outcome: defKey === "p1" ? "p1_win" : "p2_win",
    };
    return { state: st, attackerKilled: true };
  }
  return { state: st, attackerKilled: false };
}

export function setDreadnoughtCounterAction(state: PvPBattleState, who: "p1" | "p2", actionId: number | undefined): PvPBattleState {
  const side = state[who];
  if ((side.player.counterImpactGain ?? 0) <= 0) return state;
  return setSide(state, who, { ...side, stacks: { ...side.stacks,
    dreadnought: { ...side.stacks.dreadnought, enemyActionId: actionId },
  } });
}
