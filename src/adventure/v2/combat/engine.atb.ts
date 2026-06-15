import type { Monster } from "@/adventure/data/monsters";
import type { PotionId } from "@/adventure/data/potions";
import {
  actionInterval,
  depthSpdCorrection,
  effectiveMonsterSpd,
  nextActor1v1,
} from "./combatTimeline";
import {
  appendLog,
  applyPhaseTriggerIfAny,
  finishEnemyAttack,
  type BattleLogEntry,
  type BattleResolution,
  type BattleState,
  type PlayerAction,
  type PlayerCombat,
  type ResolveContext,
  initialBattleState,
  rollPlayerAttackCountWithBleed,
} from "./engine";
import { resolveEnemyPhase } from "./engine.enemyPhase";
import { resolvePlayerPhase } from "./engine.playerPhase";
import {
  decrementTimedBuffs,
  tickV2BuffMap,
  tickV2Dots,
} from "./combatShared";

export const ATB_TICK_CAP = 50 * 26;
export const ATB_ACTION_GUARD = 1000;

function hpBarEntry(state: BattleState): BattleLogEntry {
  return {
    kind: "hp_bar",
    text: "",
    turn: "player",
    playerHp: state.playerHp,
    playerMaxHp: state.playerMaxHp,
    enemyHp: state.enemyHp,
    enemyMaxHp: state.enemy.hp,
    playerMp: state.playerMp,
    playerMaxMp: state.playerMaxMp,
    enemyMp: state.enemyMp,
    enemyMaxMp: state.enemyMaxMp,
  };
}

function rollEnemyAttackCount(enemy: Monster): number {
  const chance = enemy.bonusAttackChancePct ?? 0;
  if (chance <= 0) return 1;
  const guaranteed = Math.floor(chance / 100);
  const remainder = chance - guaranteed * 100;
  return 1 + guaranteed + (Math.random() * 100 < remainder ? 1 : 0);
}

function effectivePlayerSpd(player: PlayerCombat, state: BattleState): number {
  return state.buffs.playerSpdTurnsLeft > 0
    ? player.spd * state.buffs.playerSpdMult
    : player.spd;
}

function effectiveEnemyTimelineSpd(
  state: BattleState,
  depthCorr: number,
): number {
  const base = effectiveMonsterSpd(state.enemy.spd, depthCorr);
  return state.buffs.enemySpdTurnsLeft > 0
    ? base * state.buffs.enemySpdMult
    : base;
}

function tagNewLogEntries(
  state: BattleState,
  prevLogLen: number,
  turn: "player" | "enemy",
): BattleState {
  if (state.log.length <= prevLogLen) return state;
  return {
    ...state,
    log: state.log.map((entry, idx) =>
      idx < prevLogLen || entry.turn ? entry : { ...entry, turn },
    ),
  };
}

function tickPlayerBundleEntry(state: BattleState): BattleState {
  const dotTick = tickV2Dots(state.playerV2Dots, state.playerMaxHp);
  let next: BattleState = { ...state, playerV2Dots: dotTick.nextDots };
  if (dotTick.totalDmg > 0) {
    const labels = state.playerV2Dots
      .filter((d) => d.turns > 0)
      .map((d) => d.label)
      .join(" + ");
    next = {
      ...next,
      playerHp: Math.max(0, state.playerHp - dotTick.totalDmg),
      log: appendLog(state.log, {
        kind: "enemy_attack",
        text: `[${labels}] ${dotTick.totalDmg} 피해를 입었다.`,
        turn: "player",
      }),
    };
    if (next.playerHp <= 0) {
      return {
        ...next,
        log: appendLog(next.log, {
          kind: "info",
          text: `플레이어가 쓰러졌다.`,
          turn: "player",
        }),
        phase: "ended",
        outcome: "lose",
      };
    }
  }
  return {
    ...next,
    buffs:
      next.turn.completedPlayerTurns > 0
        ? decrementTimedBuffs(next.buffs)
        : next.buffs,
    v2SelfBuffs: tickV2BuffMap(next.v2SelfBuffs),
    v2SelfDebuffs: tickV2BuffMap(next.v2SelfDebuffs),
    playerAttacksLeft:
      next.playerAttacksLeft + next.turn.queuedExtraAttacks,
    turn: { ...next.turn, queuedExtraAttacks: 0 },
  };
}

function tickEnemyBundleEntry(state: BattleState): BattleState {
  const dotTick = tickV2Dots(state.enemyV2Dots, state.enemy.hp);
  let next: BattleState = { ...state, enemyV2Dots: dotTick.nextDots };
  if (dotTick.totalDmg > 0) {
    const labels = state.enemyV2Dots
      .filter((d) => d.turns > 0)
      .map((d) => d.label)
      .join(" + ");
    next = applyPhaseTriggerIfAny({
      ...next,
      enemyHp: Math.max(0, state.enemyHp - dotTick.totalDmg),
      log: appendLog(state.log, {
        kind: "player_attack",
        text: `[${labels}] ${dotTick.totalDmg} 피해를 입혔다.`,
        turn: "enemy",
      }),
    });
    if (next.enemyHp <= 0) {
      return {
        ...next,
        log: appendLog(next.log, {
          kind: "info",
          text: `${state.enemy.name}을(를) 쓰러뜨렸다!`,
          turn: "enemy",
        }),
        phase: "ended",
        outcome: "win",
      };
    }
  }
  return {
    ...next,
    enemyV2SelfBuffs: tickV2BuffMap(next.enemyV2SelfBuffs),
    enemyV2Debuffs: tickV2BuffMap(next.enemyV2Debuffs),
  };
}

function forceAtbLoss(state: BattleState, turns: number, consumed: Partial<Record<PotionId, number>>): BattleResolution {
  return {
    outcome: "lose",
    finalState: {
      ...state,
      log: appendLog(
        appendLog(state.log, {
          kind: "info",
          text: `${ATB_TICK_CAP}틱 경과 — 적을 쓰러뜨리지 못했다.`,
        }),
        hpBarEntry(state),
      ),
      phase: "ended",
      outcome: "lose",
    },
    potionsConsumed: consumed,
    turns,
  };
}

export function resolveBattleAtb(
  player: PlayerCombat,
  enemy: Monster,
  playerName: string,
  ctx: ResolveContext,
): BattleResolution {
  const potions: Partial<Record<PotionId, number>> = { ...ctx.potions };
  const consumed: Partial<Record<PotionId, number>> = {};
  // ATB: SPD-derived extra-attack disabled; speed advantage is expressed through action frequency instead.
  // Phase-1 limitation: spec/trait extraAttack sources that are already merged into this field are disabled too.
  const atbPlayer: PlayerCombat = { ...player, extraAttackChancePct: 0 };
  // 몬스터 SPD 깊이 보정 — 깊이는 전투 내내 불변이라 1회 계산. 비-던전 전투(depth 미지정)=0.
  const depthCorr = depthSpdCorrection(ctx.depth ?? 1);
  let state = initialBattleState(atbPlayer, enemy, playerName, ctx.v2Skills);
  if (ctx.isBoss) state = { ...state, isBoss: true };
  const openingExtra: BattleLogEntry[] = ctx.openingNote
    ? [{ kind: "info", text: ctx.openingNote, turn: "player" }]
    : [];
  // ATB 는 고정 "턴"이 없다 — turn_marker 미발행. BattleLogList 가 행동 주체(액터 묶음)
  // 단위로 박스를 끊어(PvP ATB 와 동일) 타임라인이 자연히 읽힌다: 빠른 빌드는 적 행동 사이에
  // 플레이어 공격이 더 자주 나타난다. (레거시는 turn_marker 유지 → 턴 박스.)
  state = {
    ...state,
    phase: "player",
    log: [
      ...state.log.map((entry) => ({ ...entry, turn: "player" as const })),
      ...openingExtra,
    ],
    playerAttacksLeft: rollPlayerAttackCountWithBleed(state, atbPlayer),
    turn: { ...state.turn, firstAttackPending: true },
  };

  let playerNextTick = 0;
  let enemyNextTick = actionInterval(effectiveEnemyTimelineSpd(state, depthCorr));
  let actions = 0;
  let turns = 0;

  while (state.phase !== "ended") {
    const nextTick = Math.min(playerNextTick, enemyNextTick);
    if (
      nextTick > ATB_TICK_CAP ||
      actions >= ATB_ACTION_GUARD ||
      turns >= (ctx.maxTurns ?? Number.POSITIVE_INFINITY)
    ) {
      return forceAtbLoss(state, turns, consumed);
    }

    const actor = nextActor1v1(playerNextTick, enemyNextTick);
    actions += 1;
    if (actor === "player") {
      state = {
        ...state,
        phase: "player",
        playerAttacksLeft:
          state.turn.firstAttackPending
            ? rollPlayerAttackCountWithBleed(state, atbPlayer)
            : state.playerAttacksLeft,
      };
      state = tickPlayerBundleEntry(state);
      if (state.phase !== "ended") {
        // Phase-1 limitation: player v2 skill cast is not split out of legacy resolveBattle yet,
        // so ATB bundles only drive the existing player phase helper.
        let action: PlayerAction = { kind: "attack" };
        const picked = ctx.pickAction(state);
        if (picked.kind === "use_potion") {
          const have = potions[picked.potionId] ?? 0;
          if (have > 0) {
            potions[picked.potionId] = have - 1;
            consumed[picked.potionId] = (consumed[picked.potionId] ?? 0) + 1;
            action = picked;
          }
        } else {
          action = picked;
        }
        while (state.phase === "player") {
          const prevLogLen = state.log.length;
          state = resolvePlayerPhase(state, atbPlayer, playerName, action);
          state = tagNewLogEntries(state, prevLogLen, "player");
          action = { kind: "attack" };
          if (state.phase === "ended") break;
        }
      }
      playerNextTick += actionInterval(effectivePlayerSpd(atbPlayer, state));
      turns += 1;
    } else {
      state = {
        ...state,
        phase: "enemy",
        turn: {
          ...state.turn,
          enemyAttacksLeft: rollEnemyAttackCount(state.enemy),
        },
      };
      state = tickEnemyBundleEntry(state);
      if (state.phase !== "ended") {
        // Phase-1 limitation: enemyV2Debuffs ownership and enemy v2 skill casts remain legacy-loop concerns.
        // Phase-1 limitation: Shadow Step is still evaluated by the helper per enemy bundle, not per individual hit.
        while (state.phase === "enemy") {
          const prevLogLen = state.log.length;
          state = resolveEnemyPhase(state, atbPlayer, playerName, false);
          state = tagNewLogEntries(state, prevLogLen, "enemy");
          if (state.phase === "ended") break;
          if (state.turn.enemyAttacksLeft <= 0) state = finishEnemyAttack(state);
        }
      }
      enemyNextTick += actionInterval(effectiveEnemyTimelineSpd(state, depthCorr));
    }

    if (state.phase !== "ended") {
      state = {
        ...state,
        log: appendLog(state.log, hpBarEntry(state)),
      };
    }
  }

  return {
    outcome: state.outcome!,
    finalState: { ...state, log: appendLog(state.log, hpBarEntry(state)) },
    potionsConsumed: consumed,
    turns,
  };
}
