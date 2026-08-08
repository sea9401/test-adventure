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
  castV2SkillOnAttackerTurnPvP,
  endAttackerPhase,
  initialBattleStatePvP,
  rollPvPAttackCount,
  tickPvPSideDotsOnAction,
  type PvPBattleResolution,
  type PvPBattleState,
  type PvPOutcome,
  type PvPResolveContext,
  type PvPSide,
} from "./engine-pvp";
import { V2_ATB_SKILLS } from "@/adventure/data/v2/coreLoopConfig";

// PvE 사냥과 같은 3000틱 상한을 사용한다. 양쪽 모두 플레이어 스케일 SPD를 쓰므로 실제 행동 수는
// 각자의 actionInterval에 따라 달라지며, 장기전만 사냥과 동일한 타임라인 길이까지 허용한다.
export const PVP_ATB_TICK_CAP = 3_000;
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
    playerMagicBarrier: state.p1.magicBarrier,
    playerMagicBarrierMax: state.p1.maxMagicBarrier,
    enemyMagicBarrier: state.p2.magicBarrier,
    enemyMagicBarrierMax: state.p2.maxMagicBarrier,
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
    ctx.damageMultiplier,
    ctx.sustainMultiplier,
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

    // DoT 는 피격시킨 상대의 행동 종료가 아니라, 대상 본인의 실제 ATB 행동 시작에 틱한다.
    const dotLogLen = state.log.length;
    state = withAtbPlayers(tickPvPSideDotsOnAction(state, who));
    state = tagNewLogEntries(state, dotLogLen, who, nextTick);
    if (state.phase === "ended") {
      turns += 1;
      break;
    }

    // v2 스킬 시전(V2_ATB_SKILLS) — 스킬이 발동하면 이번 행동을 소진해 평타를 대체한다.
    // 다단 적중 시그니처로 생긴 추가 행동만 같은 번들에서 평타로 이어진다. PvP 의 v2 buff tick 은
    // castV2SkillOnAttackerTurnPvP 내부가 소유(번들엔 tick 없음) → 이중 tick 없음.
    let castSelfHastePct = 0; // 바람 — who 의 다음 행동 틱 가속(아래 틱 증가에서 반영).
    let castFired = false;
    if (V2_ATB_SKILLS) {
      const castLogLen = state.log.length;
      const cast = castV2SkillOnAttackerTurnPvP(state, who);
      state = withAtbPlayers(cast.state);
      state = tagNewLogEntries(state, castLogLen, who, nextTick);
      castFired = cast.castFired;
      castSelfHastePct = cast.selfHastePct;
      if (cast.enemyDelayPct > 0) {
        // 대지 — 상대(other)의 다음 행동(p?NextTick 에 예약됨)을 상대 인터벌의 pct% 만큼 뒤로 민다.
        const push =
          actionInterval(effectiveSideSpd(state, other)) * (cast.enemyDelayPct / 100);
        if (other === "p1") p1NextTick += push;
        else p2NextTick += push;
      }
      if (
        cast.castFired &&
        cast.signatureExtraActions <= 0 &&
        state.phase === who
      ) {
        state = withAtbPlayers(
          endAttackerPhase(state, who, other, { tickDefenderDots: false }),
        );
        state = tagNewLogEntries(state, castLogLen, who, nextTick);
      }
    }

    if (state.phase === who) {
      let action: PlayerAction = { kind: "attack" };
      // 스킬로 얻은 추가 행동은 PvE와 동일하게 평타로만 소비한다.
      if (!castFired) {
        const picked = ctx.pickAction(state, who);
        if (picked.kind === "use_potion") {
          const have = potions[who][picked.potionId] ?? 0;
          if (have > 0) {
            potions[who][picked.potionId] = have - 1;
            consumed[who][picked.potionId] =
              (consumed[who][picked.potionId] ?? 0) + 1;
            action = picked;
          }
        } else {
          action = picked;
        }
      }

      while (state.phase === who) {
        const prevLogLen = state.log.length;
        state = withAtbPlayers(
          advanceTurnPvP(state, action, { tickDefenderDots: false }),
        );
        state = tagNewLogEntries(state, prevLogLen, who, nextTick);
        action = { kind: "attack" };
        if (state.phase === "ended") break;
      }
    }

    // 바람 — 이번 액터의 다음 행동 틱을 가속(pct% 단축). 미시전이면 0 → 무변.
    if (who === "p1") {
      p1NextTick +=
        actionInterval(effectiveSideSpd(state, "p1")) * (1 - castSelfHastePct / 100);
    } else {
      p2NextTick +=
        actionInterval(effectiveSideSpd(state, "p2")) * (1 - castSelfHastePct / 100);
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
