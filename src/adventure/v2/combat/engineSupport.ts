import {
  healingAfterReceivedMultiplier,
} from "./combatShared";
import {
  EVASION_DAMAGE_REDUCTION_MAX_PCT,
  pveEvasionDamageReductionPct,
} from "@/adventure/data/v2/v2CombatConstants";
import {
  healToShield,
  rollEvasionActionRecovery,
} from "./signatureEffects";
import type {
  BattleLogEntry,
  BattleState,
  PlayerCombat,
} from "./engineState";

// 오프라인 시뮬레이션은 전투 로그를 읽지 않는다. 로그 수집을 끄면 매 턴 배열을
// 복사하는 O(턴²) 비용 없이 같은 배열 참조를 유지한다.
let battleLogCollectionEnabled = true;

export function setBattleLogCollection(enabled: boolean): void {
  battleLogCollectionEnabled = enabled;
}

export function appendLog(
  log: BattleLogEntry[],
  entry: BattleLogEntry,
): BattleLogEntry[] {
  return battleLogCollectionEnabled ? [...log, entry] : log;
}

export function applyHealShieldIfAny(
  state: BattleState,
  player: PlayerCombat,
  actualHeal: number,
  calculatedHeal: number = actualHeal,
): BattleState {
  const signature = healToShield(player.equipSignatures, {
    actualHeal,
    calculatedHeal,
    maxHp: state.playerMaxHp,
  });
  if (!signature) return state;
  return {
    ...state,
    stacks: {
      ...state.stacks,
      playerShield: state.stacks.playerShield + signature.amount,
    },
    log: appendLog(state.log, {
      kind: "info",
      text: `[${signature.label}] 보호막 +${signature.amount}`,
    }),
  };
}

export function playerPveEvasionReductionPct(
  state: BattleState,
  player: PlayerCombat,
): number {
  const luckEvadeBonus = state.flags.luckyBuffActive
    ? player.doubleLuck?.evade ?? 0
    : 0;
  const temporaryEvasionIncreasePct =
    luckEvadeBonus +
    (player.universalLuckBonusPct ?? 0) +
    state.buffs.cyclingChiBonus +
    (state.stacks.skillEvasionTurns > 0 ? state.stacks.skillEvasionPct : 0);
  const chillSlowPct =
    state.enemy.skill?.kind === "chill"
      ? state.stacks.chillStacks *
        (state.enemy.skill.evasionPenaltyPerStack ?? 0)
      : 0;
  const accuracyDownPct =
    state.stacks.enemyAccuracyDownTurns > 0
      ? state.stacks.enemyAccuracyDownPct
      : 0;
  const enemyAccuracy = Math.max(
    0,
    (state.enemy.accuracy ?? 0) *
      (1 - Math.min(100, Math.max(0, accuracyDownPct)) / 100),
  );
  const evasionRating = Math.max(
    0,
    (player.evaRating ?? player.evasionPct) *
      (1 + Math.max(0, temporaryEvasionIncreasePct) / 100) *
      (1 - Math.min(100, Math.max(0, chillSlowPct)) / 100),
  );
  return Math.min(
    EVASION_DAMAGE_REDUCTION_MAX_PCT,
    pveEvasionDamageReductionPct(evasionRating, enemyAccuracy) +
      Math.max(0, player.finalEvasionReductionPctAdd ?? 0),
  );
}

export function applyEvasionActionRecoveryPvE(
  state: BattleState,
  player: PlayerCombat,
  playerName: string,
  roll: () => number = Math.random,
): BattleState {
  const recovery = rollEvasionActionRecovery(
    player.equipSignatures,
    state.playerHp,
    state.playerMaxHp,
    playerPveEvasionReductionPct(state, player),
    roll,
  );
  if (!recovery) return state;
  const calculatedHeal = healingAfterReceivedMultiplier(
    recovery.amount,
    player.receivedHealMult,
  );
  const nextHp = Math.min(state.playerMaxHp, state.playerHp + calculatedHeal);
  const actual = nextHp - state.playerHp;
  if (actual <= 0) return state;
  const next = {
    ...state,
    playerHp: nextHp,
    log: appendLog(state.log, {
      kind: "info" as const,
      text: `[${recovery.label}] ${playerName}의 HP +${actual}`,
      turn: "player" as const,
    }),
  };
  return applyHealShieldIfAny(next, player, actual, calculatedHeal);
}
