import { finishBerserkerCurrentActionGuard } from "./berserkerCombat";
import { statusDamageAfterReduction } from "./combatShared";
import { applyBerserkerHostileDamage } from "./engine.pveOperations";
import { type BattleState, type PlayerCombat } from "./engineState";
import { appendLog } from "./engineSupport";
import { magicBarrierCombatLogEntries, resolveMagicBarrierDamage } from "./magicBarrier";
import { recordChargeHpLoss } from "./ruinBladeCombat";
import {
  TOXIC_BLOOD_MAX_STACKS,
  TOXIC_RECOVERY_LOCK_ACTIONS,
  consumeToxicRecoveryAction,
  resolveToxicBloodGain,
  toxicBloodRawDotDamage,
  toxicBloodRawExplosionDamage,
  toxicBloodRecoveryMultiplier,
} from "./toxicBloodLordMechanic";

export function appendToxicBloodLog(
  state: BattleState,
  text: string,
  turn: "player" | "enemy",
  tick: number,
): BattleState {
  return {
    ...state,
    log: appendLog(state.log, {
      kind: "info",
      effect: "status_damage",
      text,
      turn,
      t: tick,
    }),
  };
}


export function applyToxicBloodStatusDamage(args: {
  state: BattleState;
  player: PlayerCombat;
  rawDamage: number;
  label: string;
  turn: "player" | "enemy";
  tick: number;
}): BattleState {
  const mechanic = args.state.bossMechanic;
  if (!mechanic || mechanic.kind !== "toxic_blood_lord") return args.state;

  const barrier = resolveMagicBarrierDamage({
    rawDamage: args.rawDamage,
    durability: args.state.playerMagicBarrier ?? 0,
    absorbPct: args.player.magicBarrierAbsorbPct,
    efficiencyPct: args.player.magicBarrierEfficiencyPct,
    eligible: true,
    mitigateBody: (bodyRawDamage) =>
      statusDamageAfterReduction(
        bodyRawDamage,
        args.player.statusDamageReductionPct,
      ),
  });
  const hpBefore = args.state.playerHp;
  let next: BattleState = {
    ...args.state,
    playerMagicBarrier: barrier.durabilityLeft,
  };
  const damageLogIndex = next.log.length;
  next = appendToxicBloodLog(
    next,
    `${args.label} ${barrier.hpBoundDamage}`,
    args.turn,
    args.tick,
  );
  for (const entry of magicBarrierCombatLogEntries(barrier)) {
    next = {
      ...next,
      log: appendLog(next.log, {
        ...entry,
        turn: args.turn,
        t: args.tick,
      }),
    };
  }

  const survival = applyBerserkerHostileDamage(
    next,
    args.player,
    hpBefore - barrier.hpBoundDamage,
    args.turn,
  );
  next = survival.state;
  if (survival.triggered && next.berserker) {
    next = {
      ...next,
      berserker: finishBerserkerCurrentActionGuard(next.berserker),
    };
  }
  const enduranceFires =
    next.playerHp <= 0 &&
    !!args.player.enduranceActive &&
    !next.flags.enduranceTriggered;
  if (enduranceFires) {
    next = {
      ...next,
      playerHp: 1,
      flags: { ...next.flags, enduranceTriggered: true },
      log: appendLog(next.log, {
        kind: "info",
        text: `[불굴] 마지막 한 숨 — HP 1 로 버텼다!`,
        turn: args.turn,
        t: args.tick,
      }),
    };
  }

  const actualDamage = Math.max(0, hpBefore - Math.max(0, next.playerHp));
  const damageLog = next.log[damageLogIndex];
  if (damageLog?.text === `${args.label} ${barrier.hpBoundDamage}`) {
    next = {
      ...next,
      log: [
        ...next.log.slice(0, damageLogIndex),
        { ...damageLog, text: `${args.label} ${actualDamage}` },
        ...next.log.slice(damageLogIndex + 1),
      ],
    };
  }
  if (next.stacks.tier7?.ruinCharge && actualDamage > 0) {
    next = {
      ...next,
      stacks: {
        ...next.stacks,
        tier7: {
          ...next.stacks.tier7,
          ruinCharge: {
            ...recordChargeHpLoss(
              next.stacks.tier7.ruinCharge,
              actualDamage,
            ),
            deathBypassTriggered:
              next.stacks.tier7.ruinCharge.deathBypassTriggered ||
              survival.triggered,
          },
        },
      },
    };
  }
  const currentMechanic = next.bossMechanic;
  if (currentMechanic?.kind === "toxic_blood_lord") {
    next = {
      ...next,
      bossMechanic: {
        ...currentMechanic,
        toxicDamageTaken: currentMechanic.toxicDamageTaken + actualDamage,
      },
    };
  }
  if (next.playerHp > 0) return next;
  return {
    ...next,
    playerHp: 0,
    log: appendLog(next.log, {
      kind: "info",
      text: `플레이어가 쓰러졌다.`,
      turn: args.turn,
      t: args.tick,
    }),
    phase: "ended",
    outcome: "lose",
  };
}


export function settleToxicBloodAfterEnemyAction(args: {
  state: BattleState;
  player: PlayerCombat;
  logStart: number;
  tick: number;
}): BattleState {
  const mechanic = args.state.bossMechanic;
  if (!mechanic || mechanic.kind !== "toxic_blood_lord") return args.state;
  if (args.state.playerHp <= 0 || args.state.enemyHp <= 0) return args.state;

  const attacks = args.state.log.slice(args.logStart);
  const hpDamage = attacks.reduce(
    (sum, entry) =>
      entry.kind === "enemy_attack"
        ? sum + Math.max(0, entry.enemyHpDamage ?? 0)
        : sum,
    0,
  );
  if (hpDamage <= 0) return args.state;

  const gain = attacks.some(
    (entry) =>
      entry.kind === "enemy_attack" && entry.heavyBlowFired === true,
  )
    ? 2
    : 1;
  const resolution = resolveToxicBloodGain({
    current: mechanic.toxicBloodStacks,
    gain,
  });
  const displayStacks = resolution.exploded
    ? TOXIC_BLOOD_MAX_STACKS
    : resolution.stacks;
  let state: BattleState = {
    ...args.state,
    bossMechanic: {
      ...mechanic,
      toxicBloodStacks: resolution.stacks,
      toxicExplosionCount:
        mechanic.toxicExplosionCount + (resolution.exploded ? 1 : 0),
    },
  };
  state = appendToxicBloodLog(
    state,
    `[독혈] +${gain} · 현재 ${displayStacks}/${TOXIC_BLOOD_MAX_STACKS}`,
    "enemy",
    args.tick,
  );
  if (resolution.exploded) {
    state = appendToxicBloodLog(
      state,
      `[독혈 ${TOXIC_BLOOD_MAX_STACKS}/${TOXIC_BLOOD_MAX_STACKS}] 축적된 독혈이 한꺼번에 파열된다.`,
      "enemy",
      args.tick,
    );
  } else if (mechanic.toxicBloodStacks < 7 && displayStacks >= 7) {
    state = appendToxicBloodLog(
      state,
      `[독혈 ${displayStacks}/${TOXIC_BLOOD_MAX_STACKS}] 축적된 독혈이 불길하게 맥동한다. 폭발이 임박했다.`,
      "enemy",
      args.tick,
    );
  } else if (mechanic.toxicBloodStacks < 4 && displayStacks >= 4) {
    state = appendToxicBloodLog(
      state,
      `[독혈 ${displayStacks}/${TOXIC_BLOOD_MAX_STACKS}] 검붉은 독혈이 상처 깊숙이 스며든다.`,
      "enemy",
      args.tick,
    );
  }
  if (!resolution.exploded) return state;

  state = applyToxicBloodStatusDamage({
    state,
    player: args.player,
    rawDamage: toxicBloodRawExplosionDamage(state.playerMaxHp),
    label: "[독혈 폭발] 최대 체력 비례 피해",
    turn: "enemy",
    tick: args.tick,
  });
  if (state.playerHp <= 0) return state;
  const survivedMechanic = state.bossMechanic;
  if (survivedMechanic?.kind !== "toxic_blood_lord") return state;
  state = {
    ...state,
    bossMechanic: {
      ...survivedMechanic,
      toxicRecoveryLockActions: TOXIC_RECOVERY_LOCK_ACTIONS,
    },
  };
  return appendToxicBloodLog(
    state,
    `[회복 억제] 받는 회복량 -50% · ${TOXIC_RECOVERY_LOCK_ACTIONS}회 행동`,
    "enemy",
    args.tick,
  );
}


export function tickToxicBloodOnPlayerAction(
  state: BattleState,
  player: PlayerCombat,
  tick: number,
): BattleState {
  const mechanic = state.bossMechanic;
  if (!mechanic || mechanic.kind !== "toxic_blood_lord") return state;
  const rawDamage = toxicBloodRawDotDamage(
    state.playerMaxHp,
    mechanic.toxicBloodStacks,
  );
  if (rawDamage <= 0) return state;
  return applyToxicBloodStatusDamage({
    state,
    player,
    rawDamage,
    label: `[독혈 ${mechanic.toxicBloodStacks}중첩] 지속 피해`,
    turn: "player",
    tick,
  });
}


export function consumeToxicRecoveryAfterPlayerAction(
  state: BattleState,
  actionsAtStart: number,
  tick: number,
): BattleState {
  const mechanic = state.bossMechanic;
  if (
    !mechanic ||
    mechanic.kind !== "toxic_blood_lord" ||
    actionsAtStart <= 0
  ) {
    return state;
  }
  const nextActions = consumeToxicRecoveryAction(actionsAtStart);
  let next: BattleState = {
    ...state,
    bossMechanic: {
      ...mechanic,
      toxicRecoveryLockActions: nextActions,
    },
  };
  if (nextActions === 0) {
    next = appendToxicBloodLog(
      next,
      "[회복 억제] 해제",
      "player",
      tick,
    );
  }
  return next;
}


export function playerWithToxicRecoveryMultiplier(
  state: BattleState,
  player: PlayerCombat,
): PlayerCombat {
  const mechanic = state.bossMechanic;
  if (!mechanic || mechanic.kind !== "toxic_blood_lord") return player;
  const toxicMultiplier = toxicBloodRecoveryMultiplier({
    stacks: mechanic.toxicBloodStacks,
    recoveryLockActions: mechanic.toxicRecoveryLockActions,
  });
  if (toxicMultiplier === 1) return player;
  return {
    ...player,
    receivedHealMult: (player.receivedHealMult ?? 1) * toxicMultiplier,
  };
}
