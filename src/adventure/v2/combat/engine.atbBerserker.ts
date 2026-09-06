import type { Monster } from "@/adventure/data/monsters";
import { withoutPrematureVictoryLog } from "./engine.atbFortress";
import { type BattleState } from "./engineState";
import { appendLog } from "./engineSupport";
import {
  advanceImmortalBerserkerEnemyAction,
  immortalBerserkerMultipliers,
  settleImmortalBerserkerDamage,
} from "./immortalBerserkerMechanic";

export function applyImmortalBerserkerLifeToEnemy(
  state: BattleState,
  baseEnemy: Monster,
): BattleState {
  const mechanic = state.bossMechanic;
  if (!mechanic || mechanic.kind !== "immortal_berserker") return state;
  const multipliers = immortalBerserkerMultipliers(mechanic.lifeIndex);
  return {
    ...state,
    enemy: {
      ...state.enemy,
      atk: baseEnemy.atk * multipliers.atkMult,
      spd: baseEnemy.spd * multipliers.spdMult,
    },
  };
}


export function settleImmortalBerserkerAfterPlayerDamage(args: {
  before: BattleState;
  after: BattleState;
  tick: number;
}): BattleState {
  const mechanic = args.before.bossMechanic;
  if (!mechanic || mechanic.kind !== "immortal_berserker") {
    return args.after;
  }
  const incomingDamage = Math.max(0, args.before.enemyHp - args.after.enemyHp);
  if (incomingDamage <= 0) return args.after;
  const settled = settleImmortalBerserkerDamage({
    state: mechanic,
    currentHp: args.before.enemyHp,
    incomingDamage,
    maxHp: args.before.bossSharedMaxHp ?? args.before.enemy.hp,
  });
  let log = args.after.log;
  if (settled.revived) {
    log = withoutPrematureVictoryLog(args.before, { ...args.after, log });
    const ordinal = settled.state.lifeIndex === 1 ? "첫 번째" : "두 번째";
    const multipliers = immortalBerserkerMultipliers(settled.state.lifeIndex);
    log = appendLog(log, {
      kind: "info",
      effect: "status",
      text: `${ordinal} 부활 · 생명 ${settled.state.lifeIndex + 1}/3`,
      turn: "player",
      t: args.tick,
    });
    log = appendLog(log, {
      kind: "info",
      effect: "status",
      text: `광폭 · 공격력 +${Math.round((multipliers.atkMult - 1) * 100)}% · 행동 속도 +${Math.round((multipliers.spdMult - 1) * 100)}%`,
      turn: "player",
      t: args.tick,
    });
  }
  const playerDefeated =
    args.after.playerHp <= 0 || args.after.outcome === "lose";
  return {
    ...args.after,
    enemyHp: settled.hp,
    bossMechanic: {
      ...settled.state,
      immortalBodyDamage:
        mechanic.immortalBodyDamage + settled.appliedDamage,
      immortalHealing: mechanic.immortalHealing,
      immortalRevivalCount:
        mechanic.immortalRevivalCount + (settled.revived ? 1 : 0),
    },
    log,
    ...(settled.revived && !playerDefeated
      ? {
          phase: "enemy" as const,
          outcome: null,
          playerAttacksLeft: 0,
          turn: {
            ...args.after.turn,
            completedPlayerTurns:
              args.before.turn.completedPlayerTurns + 1,
            doubleStrikeUsedThisTurn: false,
            lightspeedUsedThisTurn: false,
            critThisTurn: false,
            riposteUsedThisTurn: false,
            firstAttackPending: true,
            galeChainsThisTurn: 0,
            weakpointUsedThisTurn: false,
            fatedChainTriggeredThisTurn: false,
          },
        }
      : {}),
  };
}


export function settleImmortalBerserkerAfterEnemyAction(
  state: BattleState,
  baseEnemy: Monster,
  tick: number,
): BattleState {
  const mechanic = state.bossMechanic;
  if (
    !mechanic ||
    mechanic.kind !== "immortal_berserker" ||
    state.enemyHp <= 0
  ) {
    return state;
  }
  const advanced = advanceImmortalBerserkerEnemyAction({
    state: mechanic,
    currentHp: state.enemyHp,
    maxHp: state.bossSharedMaxHp ?? state.enemy.hp,
  });
  let log = state.log;
  if (advanced.regenerationTriggered) {
    log = appendLog(log, {
      kind: "info",
      effect: "status",
      text: `재생 +${advanced.healed.toLocaleString("ko-KR")}`,
      turn: "enemy",
      t: tick,
    });
  }
  return applyImmortalBerserkerLifeToEnemy(
    {
      ...state,
      enemyHp: advanced.hp,
      bossMechanic: {
        ...advanced.state,
        immortalBodyDamage: mechanic.immortalBodyDamage,
        immortalHealing: mechanic.immortalHealing + advanced.healed,
        immortalRevivalCount: mechanic.immortalRevivalCount,
      },
      log,
    },
    baseEnemy,
  );
}
