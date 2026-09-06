import { appendLog } from "./engineSupport";
import { recordCombatMetric } from "./combatDiagnostics";
import { type PvPBattleState, type PvPSide } from "./engine.pvpState";
import { applyBerserkerLethalDamage, clampBerserkerGuardedHp } from "./berserkerCombat";

export type PvPHostileDamageSurvival = {
  side: PvPSide;
  berserkerTriggered: boolean;
  enduranceTriggered: boolean;
};

export function applyBerserkerHostileDamagePvP(
  side: PvPSide,
  hpAfterDamage: number,
  diagnosticTarget = "unknown",
): { side: PvPSide; triggered: boolean } {
  if (!side.berserker) {
    return {
      side: { ...side, hp: Math.max(0, hpAfterDamage) },
      triggered: false,
    };
  }
  const guardedHp = clampBerserkerGuardedHp(
    side.berserker,
    hpAfterDamage,
  );
  const result = applyBerserkerLethalDamage({
    state: side.berserker,
    madnessRank: side.player.berserkerMadnessRank ?? 0,
    hp: guardedHp,
    maxHp: side.maxHp,
    source: "hostile",
  });
  recordCombatMetric("survival_restoration", "berserker", diagnosticTarget, Math.max(0, result.hp) - Math.max(0, hpAfterDamage));
  return {
    side: {
      ...side,
      hp: Math.max(0, result.hp),
      berserker: result.state,
    },
    triggered: result.triggered,
  };
}

export function resolvePvPHostileDamageSurvival(
  side: PvPSide,
  hpAfterDamage: number,
  diagnosticTarget = "unknown",
): PvPHostileDamageSurvival {
  const survival = applyBerserkerHostileDamagePvP(side, hpAfterDamage, diagnosticTarget);
  let nextSide = survival.side;
  const enduranceTriggered =
    nextSide.hp <= 0 &&
    !!side.player.enduranceActive &&
    !side.flags.enduranceTriggered;
  if (enduranceTriggered) {
    recordCombatMetric("survival_restoration", "endurance", diagnosticTarget, 1);
    nextSide = {
      ...nextSide,
      hp: 1,
      flags: { ...nextSide.flags, enduranceTriggered: true },
    };
  }
  return {
    side: nextSide,
    berserkerTriggered: survival.triggered,
    enduranceTriggered,
  };
}

export function appendPvPSurvivalLogs(
  state: PvPBattleState,
  key: "p1" | "p2",
  name: string,
  result: PvPHostileDamageSurvival,
): PvPBattleState {
  let next = state;
  if (result.berserkerTriggered) {
    next = {
      ...next,
      log: appendLog(next.log, {
        kind: "info",
        text: `[사망 극복] ${name}이(가) 쓰러지지 않고 HP ${result.side.hp}로 돌아왔다.`,
        side: key,
      }),
    };
    if ((result.side.player.berserkerMadnessRank ?? 0) >= 4) {
      next = {
        ...next,
        log: appendLog(next.log, {
          kind: "info",
          text: `[패황의 지배] 다음 공격 강화 · 멸왕일도 1회 재충전.`,
          side: key,
        }),
      };
    }
  }
  if (result.enduranceTriggered) {
    next = {
      ...next,
      log: appendLog(next.log, {
        kind: "info",
        text: `[불굴] ${name} 마지막 한 숨 — HP 1 로 버텼다!`,
        side: key,
      }),
    };
  }
  return next;
}
