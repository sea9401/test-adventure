import type { BattleState, PlayerCombat } from "./engineState";
import { appendLog, applyHealShieldIfAny } from "./engineSupport";
import { healingAfterReceivedMultiplier } from "./combatShared";
import { recordCombatMetric } from "./combatDiagnostics";

// 재생 — 플레이어 턴 종료 후 (completedPlayerTurns 증가 후) 호출.
// completedPlayerTurns 가 interval 의 배수일 때 HP +amount.
export function applyRegenIfAny(
  state: BattleState,
  player: PlayerCombat,
  playerName: string,
): BattleState {
  const regen = player.regen;
  if (!regen || regen.interval <= 0 || regen.amount <= 0) return state;
  if (state.turn.completedPlayerTurns === 0) return state;
  if (state.turn.completedPlayerTurns % regen.interval !== 0) return state;
  if (state.playerHp >= state.playerMaxHp) return state;
  const calculatedHeal = healingAfterReceivedMultiplier(
    regen.amount,
    player.receivedHealMult,
  );
  const newHp = Math.min(state.playerMaxHp, state.playerHp + calculatedHeal);
  const actual = newHp - state.playerHp;
  recordCombatMetric("healing", "regen", "player", actual);
  return applyHealShieldIfAny({
    ...state,
    playerHp: newHp,
    log: appendLog(state.log, {
      kind: "info",
      text: `[재생] ${playerName}의 HP +${actual}`,
    }),
  }, player, actual, calculatedHeal);
}


// 별빛 재생(regen) — 매 플레이어 턴 종료 시 maxHp 의 %만큼 회복.
// interval 없이 매 턴 발동. 이미 풀 HP 면 노옵. 회복량은 정수 floor.
export function applyEnchantRegenIfAny(
  state: BattleState,
  player: PlayerCombat,
  playerName: string,
): BattleState {
  const pct = player.enchantRegenPctPerTurn ?? 0;
  if (pct <= 0) return state;
  if (state.turn.completedPlayerTurns === 0) return state;
  if (state.playerHp >= state.playerMaxHp) return state;
  const heal = healingAfterReceivedMultiplier(
    Math.floor((state.playerMaxHp * pct) / 100),
    player.receivedHealMult,
  );
  if (heal <= 0) return state;
  const newHp = Math.min(state.playerMaxHp, state.playerHp + heal);
  const actual = newHp - state.playerHp;
  recordCombatMetric("healing", "enchant_regen", "player", actual);
  return applyHealShieldIfAny({
    ...state,
    playerHp: newHp,
    log: appendLog(state.log, {
      kind: "info",
      text: `[재생] ${playerName}의 HP +${actual}`,
    }),
  }, player, actual, heal);
}


// 매 플레이어 턴 종료 시 자가 회복 — 직업 패시브 가호(HP %) + 워메이지 마력 순환(MP flat).
export function applyPassiveTurnHealIfAny(
  state: BattleState,
  player: PlayerCombat,
  playerName: string,
): BattleState {
  // 워메이지 마력 순환 — MP 회복(flat). HP 회복과 독립이라 HP 가 가득이어도 돈다.
  // MP 가 자원화된 v2 에서 시전 페이스를 받쳐 주는 시그니처.
  let s = state;
  const mpRegen = player.mpRegenPerTurn ?? 0;
  if (
    mpRegen > 0 &&
    s.turn.completedPlayerTurns > 0 &&
    s.playerMp < s.playerMaxMp
  ) {
    const newMp = Math.min(s.playerMaxMp, s.playerMp + mpRegen);
    const actualMp = newMp - s.playerMp;
    if (actualMp > 0) {
      s = {
        ...s,
        playerMp: newMp,
        log: appendLog(s.log, {
          kind: "info",
          text: `[마력 순환] ${playerName}의 MP +${actualMp}`,
        }),
      };
    }
  }

  const pct = player.passiveTurnHealPctMaxHp ?? 0;
  if (pct <= 0) return s;
  if (s.turn.completedPlayerTurns === 0) return s;
  if (s.playerHp >= s.playerMaxHp) return s;
  const heal = healingAfterReceivedMultiplier(
    Math.floor((s.playerMaxHp * pct) / 100),
    player.receivedHealMult,
  );
  if (heal <= 0) return s;
  const newHp = Math.min(s.playerMaxHp, s.playerHp + heal);
  const actual = newHp - s.playerHp;
  recordCombatMetric("healing", "passive_regen", "player", actual);
  return applyHealShieldIfAny({
    ...s,
    playerHp: newHp,
    log: appendLog(s.log, {
      kind: "info",
      text: `[가호] ${playerName}의 HP +${actual}`,
    }),
  }, player, actual, heal);
}
