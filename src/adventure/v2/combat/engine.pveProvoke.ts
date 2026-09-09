import { resolveEnemyPhase } from "./engine.enemyPhase";
import { markForcedActionMainLog, type BattleState, type PlayerCombat } from "./engineState";
import { appendLog } from "./engineSupport";

export function applyImmediateProvokedEnemyBasicAttacks(
  state: BattleState,
  player: PlayerCombat,
  playerName: string,
  count: number,
  skillName: string,
): BattleState {
  const attacks = Math.max(0, Math.floor(count));
  if (attacks <= 0 || state.phase === "ended") return state;
  const originalPhase = state.phase;
  const originalEnemyAttacksLeft = state.turn.enemyAttacksLeft;
  const originalEnemyPhasesCompleted = state.turn.enemyPhasesCompleted;
  const originalCounterAction = state.stacks.dreadnought?.enemyActionId;
  if ((player.counterImpactGain ?? 0) > 0) {
    state = { ...state, stacks: { ...state.stacks, dreadnought: {
      ...state.stacks.dreadnought, enemyActionId: -(state.turn.completedPlayerTurns + 1),
    } } };
  }
  let next: BattleState = {
    ...state,
    phase: "enemy",
    turn: { ...state.turn, enemyAttacksLeft: attacks },
    log: appendLog(state.log, {
      kind: "info",
      text: `[${skillName}] ${state.enemy.name}이(가) 즉시 기본 공격 ${attacks}회!`,
      turn: "player",
    }),
  };
  for (let index = 0; index < attacks && next.phase !== "ended"; index += 1) {
    if (index > 0 && next.phase !== "enemy") break;
    const logStart = next.log.length;
    next = resolveEnemyPhase(next, player, playerName, false, false, true);
    if (next.log.length > logStart) {
      next = {
        ...next,
        log: next.log.map((entry, logIndex) => {
          if (logIndex < logStart) return entry;
          return markForcedActionMainLog(entry.turn ? entry : { ...entry, turn: "enemy" as const }, skillName);
        }),
      };
    }
  }
  if ((player.counterImpactGain ?? 0) > 0) {
    next = { ...next, stacks: { ...next.stacks, dreadnought: {
      ...next.stacks.dreadnought, enemyActionId: originalCounterAction,
    } } };
  }
  if (next.phase === "ended") return next;
  return {
    ...next,
    phase: originalPhase,
    turn: {
      ...next.turn,
      enemyAttacksLeft: originalEnemyAttacksLeft,
      enemyPhasesCompleted: originalEnemyPhasesCompleted,
    },
  };
}
