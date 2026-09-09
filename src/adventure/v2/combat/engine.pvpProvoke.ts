import { setDreadnoughtCounterAction } from "./engine.pvpCounter";
import { setSide } from "./engine.pvpSide";
import { advanceTurnPvP } from "./engine.pvpPhase";
import { type PvPBattleState } from "./engine.pvpState";
import { markForcedActionMainLog } from "./engineState";
import { appendLog } from "./engineSupport";

// PR-4b: v2 스킬 cast — MP 차감 + cooldown set + 효과 적용 (damage/heal/buff/debuff) + 로그.
// 매 side 의 turn 진입 시 1회 — 자기 side 의 buff/debuff turn -1 tick + cast.
export function applyImmediateProvokedBasicAttacksPvP(
  state: PvPBattleState,
  provokerKey: "p1" | "p2",
  count: number,
  skillName: string,
): PvPBattleState {
  const attacks = Math.max(0, Math.floor(count));
  if (attacks <= 0 || state.phase === "ended") return state;
  const attackerKey = provokerKey === "p1" ? "p2" : "p1";
  const originalPhase = state.phase;
  const originalAttacker = state[attackerKey];
  const provoker = state[provokerKey];
  const originalCounterAction = provoker.stacks.dreadnought?.enemyActionId;
  state = setDreadnoughtCounterAction(state, provokerKey, -(provoker.turn.completedPlayerTurns + 1));
  let next = setSide(
    {
      ...state,
      phase: attackerKey,
      log: appendLog(state.log, {
        kind: "info",
        text: `[${skillName}] ${originalAttacker.name}이(가) 즉시 기본 공격 ${attacks}회!`,
        side: provokerKey,
      }),
    },
    attackerKey,
    {
      ...originalAttacker,
      // 도발 공격은 상대의 예약 행동이 아니라 시전자의 행동에 포함된 추가 공격이다.
      turn: { ...originalAttacker.turn, firstAttackPending: false },
    },
  );
  for (let index = 0; index < attacks && next.phase !== "ended"; index += 1) {
    if (next.phase !== attackerKey) break;
    const logStart = next.log.length;
    next = advanceTurnPvP(next, { kind: "attack" }, {
      tickDefenderDots: false, basicOrigin: "extra_basic", embeddedBasic: true,
    });
    if (next.log.length > logStart) {
      next = {
        ...next,
        log: next.log.map((entry, logIndex) => {
          if (logIndex < logStart) return entry;
          return markForcedActionMainLog(
            entry.side ? entry : { ...entry, side: attackerKey },
            skillName,
          );
        }),
      };
    }
  }
  next = setDreadnoughtCounterAction(next, provokerKey, originalCounterAction);
  const attackerAfterProvoke = next[attackerKey];
  return setSide(
    { ...next, phase: next.phase === "ended" ? "ended" : originalPhase },
    attackerKey,
    {
      ...attackerAfterProvoke,
      attacksLeft: originalAttacker.attacksLeft,
      turn: originalAttacker.turn,
    },
  );
}
