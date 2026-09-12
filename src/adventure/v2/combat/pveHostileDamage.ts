import { applyBerserkerLethalDamage, clampBerserkerGuardedHp } from "./berserkerCombat";
import { recordCombatMetric } from "./combatDiagnostics";
import type { BattleState, PlayerCombat } from "./engineState";
import { appendLog } from "./engineSupport";

/** 보호막·경감 뒤 적대 피해를 사망 극복 → 일반 불굴 순으로 넘기기 위한 PvE 공통 관문. */
export function applyBerserkerHostileDamage(
  state: BattleState,
  player: PlayerCombat,
  hpAfterDamage: number,
  turn: "player" | "enemy" = "enemy",
): { state: BattleState; triggered: boolean } {
  if (!state.berserker) {
    return {
      state: { ...state, playerHp: Math.max(0, hpAfterDamage) },
      triggered: false,
    };
  }
  const guardedHp = clampBerserkerGuardedHp(
    state.berserker,
    hpAfterDamage,
  );
  const result = applyBerserkerLethalDamage({
    state: state.berserker,
    madnessRank: player.berserkerMadnessRank ?? 0,
    hp: guardedHp,
    maxHp: state.playerMaxHp,
    source: "hostile",
  });
  recordCombatMetric("survival_restoration", "berserker", "player", Math.max(0, result.hp) - Math.max(0, hpAfterDamage));
  let log = state.log;
  if (result.triggered) {
    log = appendLog(log, {
      kind: "info",
      text: `[사망 극복] 쓰러지지 않고 HP ${result.hp}로 돌아왔다.`,
      turn,
    });
    if ((player.berserkerMadnessRank ?? 0) >= 4) {
      log = appendLog(log, {
        kind: "info",
        text: `[패황의 지배] 다음 공격 강화 · 멸왕일도 1회 재충전.`,
        turn,
      });
    }
  }
  return {
    state: {
      ...state,
      playerHp: Math.max(0, result.hp),
      berserker: result.state,
      log,
    },
    triggered: result.triggered,
  };
}

