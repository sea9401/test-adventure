import { setSide } from "./engine.pvpOperations";
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
      // 정확히 두 번만 직접 호출하고 페이즈 종료 후처리는 실행하지 않도록 여분 1회를 둔다.
      attacksLeft: attacks + 1,
      turn: { ...originalAttacker.turn, firstAttackPending: false },
    },
  );
  for (let index = 0; index < attacks && next.phase !== "ended"; index += 1) {
    if (next.phase !== attackerKey) break;
    const logStart = next.log.length;
    next = advanceTurnPvP(next, { kind: "attack" }, { tickDefenderDots: false });
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
  if (next.phase === "ended") return next;
  const attackerAfterProvoke = next[attackerKey];
  return setSide(
    { ...next, phase: originalPhase },
    attackerKey,
    {
      ...attackerAfterProvoke,
      attacksLeft: originalAttacker.attacksLeft,
      turn: originalAttacker.turn,
    },
  );
}
