import type { Monster } from "@/adventure/data/monsters";
import { type BattleLogEntry, type BattleState } from "./engineState";
import { appendLog } from "./engineSupport";
import {
  INVINCIBLE_FORTRESS_BARRIER_HP,
  invincibleFortressEnrageMultipliers,
  settleInvincibleFortressDamage,
  type InvincibleFortressDamageEvent,
} from "./invincibleFortressMechanic";

export function applyInvincibleFortressTierToEnemy(
  state: BattleState,
  baseEnemy: Monster,
): BattleState {
  const mechanic = state.bossMechanic;
  if (!mechanic || mechanic.kind !== "invincible_fortress") return state;
  const multipliers = invincibleFortressEnrageMultipliers(
    mechanic.activeBarrierIndex === null ? mechanic.enrageTier : 0,
  );
  return {
    ...state,
    enemy: {
      ...state.enemy,
      atk: baseEnemy.atk * multipliers.atkMult,
      spd: baseEnemy.spd * multipliers.spdMult,
    },
  };
}


export function withoutPrematureVictoryLog(
  before: BattleState,
  after: BattleState,
): BattleLogEntry[] {
  return [
    ...after.log.slice(0, before.log.length),
    ...after.log.slice(before.log.length).filter(
      (entry) => !entry.text.includes("쓰러뜨렸다"),
    ),
  ];
}


export function appendInvincibleFortressDamageEvents(
  initialLog: BattleLogEntry[],
  events: readonly InvincibleFortressDamageEvent[],
  turn: "player" | "enemy",
  tick?: number,
): BattleLogEntry[] {
  let log = initialLog;
  const timing = tick === undefined ? {} : { t: tick };
  for (const event of events) {
    if (event.kind === "barrier_started") {
      log = appendLog(log, {
        kind: "info",
        effect: "status",
        text: `방벽 시험 시작 — ${event.barrierIndex + 1}/4`,
        turn,
        ...timing,
      });
      continue;
    }
    if (event.kind === "barrier_damage") {
      const remainingBarrier = Math.max(
        0,
        INVINCIBLE_FORTRESS_BARRIER_HP - event.totalDamage,
      );
      log = appendLog(log, {
        kind: "info",
        effect: "extra_damage",
        text: `방벽 피해 +${event.damage.toLocaleString("ko-KR")} · 남은 ${remainingBarrier.toLocaleString("ko-KR")} / ${INVINCIBLE_FORTRESS_BARRIER_HP.toLocaleString("ko-KR")}`,
        turn,
        ...timing,
      });
      continue;
    }
    log = appendLog(
      appendLog(log, {
        kind: "info",
        effect: "status",
        text: `방벽 파괴 — 누적 ${event.totalDamage.toLocaleString("ko-KR")}`,
        turn,
        ...timing,
      }),
      {
        kind: "info",
        effect: "status",
        text: `광폭 ${event.tier}단계 적용`,
        turn,
        ...timing,
      },
    );
  }
  return log;
}


export function settleInvincibleFortressAfterPlayerDamage(args: {
  before: BattleState;
  after: BattleState;
  tick: number;
}): BattleState {
  const mechanic = args.before.bossMechanic;
  if (!mechanic || mechanic.kind !== "invincible_fortress") {
    return args.after;
  }
  const incomingDamage = Math.max(
    0,
    args.before.enemyHp - args.after.enemyHp,
  );
  if (incomingDamage <= 0) return args.after;
  const settled = settleInvincibleFortressDamage({
    state: mechanic,
    currentHp: args.before.enemyHp,
    incomingDamage,
    maxHp: args.before.bossSharedMaxHp ?? args.before.enemy.hp,
  });
  const log = appendInvincibleFortressDamageEvents(
    args.after.log,
    settled.barrierEvents,
    "player",
    args.tick,
  );

  const prematureVictory =
    args.after.outcome === "win" && settled.bodyHp > 0;
  if (prematureVictory) {
    const attacksLeft = Math.max(0, args.before.playerAttacksLeft - 1);
    return {
      ...args.after,
      enemyHp: settled.bodyHp,
      bossMechanic: settled.state,
      log: [
        ...withoutPrematureVictoryLog(args.before, { ...args.after, log }),
      ],
      phase: attacksLeft > 0 ? "player" : "enemy",
      outcome: null,
      playerAttacksLeft: attacksLeft,
      turn: {
        ...args.after.turn,
        completedPlayerTurns:
          attacksLeft > 0
            ? args.before.turn.completedPlayerTurns
            : args.after.turn.completedPlayerTurns,
      },
    };
  }
  return {
    ...args.after,
    enemyHp: settled.bodyHp,
    bossMechanic: settled.state,
    log,
  };
}
