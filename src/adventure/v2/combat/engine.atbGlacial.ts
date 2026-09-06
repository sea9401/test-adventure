import { type BattleState, type PlayerCombat } from "./engineState";
import { appendLog } from "./engineSupport";
import {
  GLACIAL_CHILL_THRESHOLD,
  rescaleReservedPlayerTick,
  resolveGlacialChillGain,
} from "./glacialColossusMechanic";
import { statusBlockOnce } from "./signatureEffects";
import { TRIPLE_WARD_LABELS, consumePurificationWard } from "./tripleWard";

export function appendGlacialLog(
  state: BattleState,
  text: string,
  turn: "player" | "enemy",
  tick: number,
): BattleState {
  return {
    ...state,
    log: appendLog(state.log, {
      kind: "info",
      effect: "status",
      text,
      turn,
      t: tick,
    }),
  };
}


export function appendGlacialThresholdWarning(
  state: BattleState,
  previousStacks: number,
  displayStacks: number,
  tick: number,
): BattleState {
  if (previousStacks < 7 && displayStacks >= 7) {
    return appendGlacialLog(
      state,
      `[한기 ${displayStacks}/${GLACIAL_CHILL_THRESHOLD}] 온몸에 서리가 번져 움직임을 붙잡는다.`,
      "enemy",
      tick,
    );
  }
  if (previousStacks < 4 && displayStacks >= 4) {
    return appendGlacialLog(
      state,
      `[한기 ${displayStacks}/${GLACIAL_CHILL_THRESHOLD}] 냉기장이 짙어지며 움직임이 무거워진다.`,
      "enemy",
      tick,
    );
  }
  return state;
}


export function settleGlacialChillAfterEnemyAction(args: {
  state: BattleState;
  player: PlayerCombat;
  logStart: number;
  previousStacks: number;
  currentTick: number;
  playerNextTick: number;
}): { state: BattleState; playerNextTick: number } {
  const mechanic = args.state.bossMechanic;
  if (
    !mechanic ||
    mechanic.kind !== "glacial_colossus" ||
    mechanic.glacialFreezePending === 1 ||
    args.state.playerHp <= 0 ||
    args.state.enemyHp <= 0
  ) {
    return { state: args.state, playerNextTick: args.playerNextTick };
  }
  const hpDamage = args.state.log.slice(args.logStart).reduce(
    (sum, entry) =>
      entry.kind === "enemy_attack"
        ? sum + Math.max(0, entry.enemyHpDamage ?? 0)
        : sum,
    0,
  );
  const auraResolution = resolveGlacialChillGain({
    current: mechanic.glacialChillStacks,
    gain: 1,
    freezePending: mechanic.glacialFreezePending,
  });
  let stateBeforeGain = args.state;
  let hitBlocked = false;
  if (!auraResolution.triggered && hpDamage > 0) {
    const signatureBlock = statusBlockOnce(args.player.equipSignatures);
    if (signatureBlock && !args.state.flags.statusBlockUsed) {
      hitBlocked = true;
      stateBeforeGain = appendGlacialLog(
        {
          ...args.state,
          flags: { ...args.state.flags, statusBlockUsed: true },
        },
        `[${signatureBlock.label}] 상태이상을 막았다.`,
        "enemy",
        args.currentTick,
      );
    } else {
      const ward = consumePurificationWard(args.state.stacks.tripleWard);
      if (ward.consumed) {
        hitBlocked = true;
        stateBeforeGain = appendGlacialLog(
          {
            ...args.state,
            stacks: {
              ...args.state.stacks,
              tripleWard: ward.state,
            },
          },
          `[${TRIPLE_WARD_LABELS.purification}] 상태이상을 막았다. (${ward.remaining}회 남음)`,
          "enemy",
          args.currentTick,
        );
      }
    }
  }
  const resolution =
    auraResolution.triggered || hpDamage <= 0 || hitBlocked
      ? auraResolution
      : resolveGlacialChillGain({
          current: mechanic.glacialChillStacks,
          gain: 2,
          freezePending: mechanic.glacialFreezePending,
        });
  const displayStacks = resolution.triggered
    ? GLACIAL_CHILL_THRESHOLD
    : resolution.stacks;
  let state: BattleState = {
    ...stateBeforeGain,
    bossMechanic: {
      ...mechanic,
      glacialChillStacks: resolution.stacks,
      glacialFreezePending: resolution.freezePending,
      glacialFreezeCount:
        mechanic.glacialFreezeCount + (resolution.triggered ? 1 : 0),
    },
  };
  state = appendGlacialLog(
    state,
    `[한기] +${resolution.appliedGain} · 현재 ${displayStacks}/${GLACIAL_CHILL_THRESHOLD}`,
    "enemy",
    args.currentTick,
  );
  if (resolution.triggered) {
    state = appendGlacialLog(
      state,
      `[한기 ${GLACIAL_CHILL_THRESHOLD}/${GLACIAL_CHILL_THRESHOLD}] 한기가 한계에 도달해 다음 행동이 봉쇄된다.`,
      "enemy",
      args.currentTick,
    );
    state = appendGlacialLog(
      state,
      "[빙결] 다음 행동이 봉쇄된다.",
      "enemy",
      args.currentTick,
    );
    return { state, playerNextTick: args.playerNextTick };
  }
  state = appendGlacialThresholdWarning(
    state,
    mechanic.glacialChillStacks,
    displayStacks,
    args.currentTick,
  );

  return {
    state,
    playerNextTick: rescaleReservedPlayerTick({
      currentTick: args.currentTick,
      playerNextTick: args.playerNextTick,
      previousStacks: args.previousStacks,
      nextStacks: resolution.stacks,
    }),
  };
}


export function applyGlacialFieldChill(args: {
  state: BattleState;
  currentTick: number;
  playerNextTick: number;
}): { state: BattleState; playerNextTick: number; applied: boolean } {
  const mechanic = args.state.bossMechanic;
  if (
    !mechanic ||
    mechanic.kind !== "glacial_colossus" ||
    mechanic.glacialFreezePending === 1
  ) {
    return {
      state: args.state,
      playerNextTick: args.playerNextTick,
      applied: false,
    };
  }

  const resolution = resolveGlacialChillGain({
    current: mechanic.glacialChillStacks,
    gain: 1,
    freezePending: mechanic.glacialFreezePending,
  });
  const displayStacks = resolution.triggered
    ? GLACIAL_CHILL_THRESHOLD
    : resolution.stacks;
  let state = appendGlacialLog(
    {
      ...args.state,
      bossMechanic: {
        ...mechanic,
        glacialChillStacks: resolution.stacks,
        glacialFreezePending: resolution.freezePending,
        glacialFreezeCount:
          mechanic.glacialFreezeCount + (resolution.triggered ? 1 : 0),
      },
    },
    `[혹한의 전장] 한기 +1 · 현재 ${displayStacks}/${GLACIAL_CHILL_THRESHOLD}`,
    "enemy",
    args.currentTick,
  );
  if (resolution.triggered) {
    state = appendGlacialLog(
      state,
      `[한기 ${GLACIAL_CHILL_THRESHOLD}/${GLACIAL_CHILL_THRESHOLD}] 한기가 한계에 도달해 다음 행동이 봉쇄된다.`,
      "enemy",
      args.currentTick,
    );
    state = appendGlacialLog(
      state,
      "[빙결] 다음 행동이 봉쇄된다.",
      "enemy",
      args.currentTick,
    );
    return { state, playerNextTick: args.playerNextTick, applied: true };
  }

  state = appendGlacialThresholdWarning(
    state,
    mechanic.glacialChillStacks,
    displayStacks,
    args.currentTick,
  );

  return {
    state,
    playerNextTick: rescaleReservedPlayerTick({
      currentTick: args.currentTick,
      playerNextTick: args.playerNextTick,
      previousStacks: mechanic.glacialChillStacks,
      nextStacks: resolution.stacks,
    }),
    applied: true,
  };
}


export function consumeGlacialFrozenPlayerAction(
  state: BattleState,
  tick: number,
): BattleState {
  const mechanic = state.bossMechanic;
  if (
    !mechanic ||
    mechanic.kind !== "glacial_colossus" ||
    mechanic.glacialFreezePending !== 1
  ) {
    return state;
  }
  return appendGlacialLog(
    {
      ...state,
      phase: "player",
      bossMechanic: {
        ...mechanic,
        glacialChillStacks: 0,
        glacialFreezePending: 0,
        glacialSkippedActionCount: mechanic.glacialSkippedActionCount + 1,
      },
    },
    "[빙결] 몸이 얼어붙어 행동할 수 없다.",
    "player",
    tick,
  );
}
