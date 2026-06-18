import type { PotionId } from "@/adventure/data/potions";
import { actionInterval } from "./combatTimeline";
import {
  appendLog,
  type BattleLogEntry,
  type PlayerAction,
  type PlayerCombat,
} from "./engine";
import {
  advanceTurnPvP,
  initialBattleStatePvP,
  rollPvPAttackCount,
  type PvPBattleResolution,
  type PvPBattleState,
  type PvPOutcome,
  type PvPResolveContext,
  type PvPSide,
} from "./engine-pvp";

// PvP has two player-scale actors. 2600 ticks is roughly 2x the PvE ATB cap
// and is the dial equivalent of legacy PVP_TURN_CAP=100 rounds.
export const PVP_ATB_TICK_CAP = 50 * 26 * 2;
export const PVP_ATB_ACTION_GUARD = 2000;

function hpBarEntry(state: PvPBattleState, tick?: number): BattleLogEntry {
  return {
    kind: "hp_bar",
    text: "",
    ...(tick != null ? { t: tick } : {}),
    playerHp: state.p1.hp,
    playerMaxHp: state.p1.maxHp,
    enemyHp: state.p2.hp,
    enemyMaxHp: state.p2.maxHp,
    playerMp: state.p1.mp,
    playerMaxMp: state.p1.maxMp,
    enemyMp: state.p2.mp,
    enemyMaxMp: state.p2.maxMp,
  };
}

function atbPlayerView(player: PlayerCombat): PlayerCombat {
  return {
    ...player,
    extraAttackChancePct: 0,
    extraAttackChancePctWhileEnemyBleeding: 0,
  };
}

function effectiveSideSpd(state: PvPBattleState, who: "p1" | "p2"): number {
  const side = state[who];
  const other = state[who === "p1" ? "p2" : "p1"];
  let spd = side.player.spd;
  if (side.buffs.playerSpdTurnsLeft > 0) {
    spd *= side.buffs.playerSpdMult;
  }
  if (other.buffs.enemySpdTurnsLeft > 0) {
    spd *= other.buffs.enemySpdMult;
  }
  return spd;
}

function nextActorPvP(
  p1NextTick: number,
  p2NextTick: number,
): "p1" | "p2" {
  if (p1NextTick !== p2NextTick) {
    return p1NextTick < p2NextTick ? "p1" : "p2";
  }
  return "p1";
}

function tagNewLogEntries(
  state: PvPBattleState,
  prevLogLen: number,
  side: "p1" | "p2",
  tick?: number,
): PvPBattleState {
  if (state.log.length <= prevLogLen) return state;
  return {
    ...state,
    log: state.log.map((entry, idx) => {
      if (idx < prevLogLen) return entry;
      const withSide = entry.side ? entry : { ...entry, side };
      // ATB 틱 스탬프(UI 윈도우 그룹화용) — 이미 찍혔으면 보존.
      return tick != null && withSide.t == null
        ? { ...withSide, t: tick }
        : withSide;
    }),
  };
}

function forceAtbTimeout(
  state: PvPBattleState,
  turns: number,
  consumed: PvPBattleResolution["potionsConsumed"],
): PvPBattleResolution {
  const p1Frac = state.p1.hp / state.p1.maxHp;
  const p2Frac = state.p2.hp / state.p2.maxHp;
  const outcome: PvPOutcome =
    p1Frac > p2Frac ? "p1_win" : p2Frac > p1Frac ? "p2_win" : "draw";
  return {
    outcome,
    finalState: {
      ...state,
      log: appendLog(
        appendLog(state.log, {
          kind: "info",
          text: `${PVP_ATB_TICK_CAP}틱 경과 — 남은 HP 비율로 승부를 판정했다.`,
        }),
        hpBarEntry(state),
      ),
      phase: "ended",
      outcome,
    },
    potionsConsumed: consumed,
    turns,
  };
}

function forceActionGuardDraw(
  state: PvPBattleState,
  turns: number,
  consumed: PvPBattleResolution["potionsConsumed"],
): PvPBattleResolution {
  return {
    outcome: "draw",
    finalState: {
      ...state,
      log: appendLog(state.log, hpBarEntry(state)),
      phase: "ended",
      outcome: "draw",
    },
    potionsConsumed: consumed,
    turns,
  };
}

function withAtbPlayers(state: PvPBattleState): PvPBattleState {
  return {
    ...state,
    p1: { ...state.p1, player: atbPlayerView(state.p1.player) },
    p2: { ...state.p2, player: atbPlayerView(state.p2.player) },
  };
}

function ensureBundleReady(state: PvPBattleState, who: "p1" | "p2"): PvPBattleState {
  const side: PvPSide = state[who];
  if (side.attacksLeft > 0) return state;
  const other = state[who === "p1" ? "p2" : "p1"];
  return {
    ...state,
    [who]: {
      ...side,
      attacksLeft: rollPvPAttackCount(side, other) + side.nextTurnAttackBonus,
      nextTurnAttackBonus: 0,
      turn: { ...side.turn, firstAttackPending: true },
    },
  };
}

export function resolveBattlePvPAtb(
  p1Player: PlayerCombat,
  p2Player: PlayerCombat,
  p1Name: string,
  p2Name: string,
  ctx: PvPResolveContext,
): PvPBattleResolution {
  const potions = {
    p1: { ...ctx.potions.p1 },
    p2: { ...ctx.potions.p2 },
  };
  const consumed = {
    p1: {} as Partial<Record<PotionId, number>>,
    p2: {} as Partial<Record<PotionId, number>>,
  };
  let state = initialBattleStatePvP(
    atbPlayerView(p1Player),
    atbPlayerView(p2Player),
    p1Name,
    p2Name,
    ctx.v2Skills?.p1,
    ctx.v2Skills?.p2,
  );
  state = withAtbPlayers(state);
  if (state.p1.hp <= 0 && state.p2.hp <= 0) {
    state = { ...state, outcome: "draw", phase: "ended" };
  } else if (state.p1.hp <= 0) {
    state = { ...state, outcome: "p2_win", phase: "ended" };
  } else if (state.p2.hp <= 0) {
    state = { ...state, outcome: "p1_win", phase: "ended" };
  }
  if (ctx.openingNote) {
    state = {
      ...state,
      log: [...state.log, { kind: "info", text: ctx.openingNote, turn: "player" }],
    };
  }

  let p1NextTick = actionInterval(effectiveSideSpd(state, "p1"));
  let p2NextTick = actionInterval(effectiveSideSpd(state, "p2"));
  let actions = 0;
  let turns = 0;
  let lastTick = 0; // 최종 hp_bar 스탬프용(루프 밖)

  while (state.phase !== "ended") {
    const nextTick = Math.min(p1NextTick, p2NextTick);
    lastTick = nextTick;
    if (nextTick > PVP_ATB_TICK_CAP) {
      return forceAtbTimeout(state, turns, consumed);
    }
    if (actions >= PVP_ATB_ACTION_GUARD) {
      return forceActionGuardDraw(state, turns, consumed);
    }

    const who = nextActorPvP(p1NextTick, p2NextTick);
    const other = who === "p1" ? "p2" : "p1";
    actions += 1;
    state = ensureBundleReady({ ...state, phase: who }, who);

    // Phase-2 limitation: the PvP v2 skill cast hook is still scoped inside the legacy loop,
    // so ATB bundles reuse the existing PvP attack phase helper only.
    let action: PlayerAction = { kind: "attack" };
    const picked = ctx.pickAction(state, who);
    if (picked.kind === "use_potion") {
      const have = potions[who][picked.potionId] ?? 0;
      if (have > 0) {
        potions[who][picked.potionId] = have - 1;
        consumed[who][picked.potionId] = (consumed[who][picked.potionId] ?? 0) + 1;
        action = picked;
      }
    } else {
      action = picked;
    }

    while (state.phase === who) {
      const prevLogLen = state.log.length;
      state = withAtbPlayers(advanceTurnPvP(state, action));
      state = tagNewLogEntries(state, prevLogLen, who, nextTick);
      action = { kind: "attack" };
      if (state.phase === "ended") break;
    }

    if (who === "p1") {
      p1NextTick += actionInterval(effectiveSideSpd(state, "p1"));
    } else {
      p2NextTick += actionInterval(effectiveSideSpd(state, "p2"));
    }
    turns += 1;

    if (state.phase !== "ended") {
      state = {
        ...state,
        phase: other,
        log: appendLog(state.log, hpBarEntry(state, nextTick)),
      };
    }
  }

  return {
    outcome: state.outcome ?? "draw",
    finalState: { ...state, log: appendLog(state.log, hpBarEntry(state, lastTick)) },
    potionsConsumed: consumed,
    turns,
  };
}
