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
  applyPlayerV2SkillCast,
  finishEnemyAttack,
  finishPlayerTurn,
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
import { V2_ATB_SKILLS } from "@/adventure/data/v2/coreLoopConfig";

export const ATB_TICK_CAP = 50 * 26;
export const ATB_ACTION_GUARD = 1000;

function hpBarEntry(state: BattleState, tick?: number): BattleLogEntry {
  return {
    kind: "hp_bar",
    text: "",
    turn: "player",
    ...(tick != null ? { t: tick } : {}),
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

// prevLogLen 이후 새 엔트리에 ATB 틱만 찍는다(turn 미변경). 번들 틱(DoT/사망 로그)처럼
//   tagNewLogEntries 밖에서 추가돼 turn 정렬은 그대로 둬야 하는 엔트리용 — t 누락 방지.
function stampTick(
  state: BattleState,
  prevLogLen: number,
  tick: number,
): BattleState {
  if (state.log.length <= prevLogLen) return state;
  // 새 tail 만 매핑(전체 로그 재스캔 회피 — 긴 전투에서 O(n²) 방지). 이미 t 있으면 보존.
  const tail = state.log
    .slice(prevLogLen)
    .map((entry) => (entry.t != null ? entry : { ...entry, t: tick }));
  return { ...state, log: [...state.log.slice(0, prevLogLen), ...tail] };
}

function tagNewLogEntries(
  state: BattleState,
  prevLogLen: number,
  turn: "player" | "enemy",
  tick?: number,
): BattleState {
  if (state.log.length <= prevLogLen) return state;
  return {
    ...state,
    log: state.log.map((entry, idx) => {
      if (idx < prevLogLen) return entry;
      const withTurn = entry.turn ? entry : { ...entry, turn };
      // ATB 틱 스탬프(UI 윈도우 그룹화용) — 이미 찍혔으면 보존.
      return tick != null && withTurn.t == null
        ? { ...withTurn, t: tick }
        : withTurn;
    }),
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
  let lastTick = 0; // 최종 hp_bar 스탬프용(루프 밖)

  while (state.phase !== "ended") {
    const nextTick = Math.min(playerNextTick, enemyNextTick);
    lastTick = nextTick;
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
      const playerBundleStart = state.log.length;
      state = tickPlayerBundleEntry(state);
      // 번들 틱(DoT/사망)이 전투를 끝내면 아래 행동 루프를 건너뛰어 t 미스탬프 → 최종 hp_bar 만
      //   t 를 가져 외톨이 박스가 생긴다(Codex). 여기서 같은 nextTick 으로 채워 같은 윈도우에 묶음.
      state = stampTick(state, playerBundleStart, nextTick);
      // 바람(원소술사) — 시전 시 내 다음 행동 틱 가속 %. 행동 루프 밖(아래 틱 증가)에서 쓰므로 분기 밖 선언.
      let castSelfHastePct = 0;
      if (state.phase !== "ended") {
        // v2 스킬 시전(V2_ATB_SKILLS) — cast 가 발동하면 그 행동(틱)은 시전으로 소진되고 평타
        //   루프를 건너뛴다(legacy "1틱 1행동: 강타 OR 평타" 미러). buff/debuff tick 은 위
        //   tickPlayerBundleEntry 가 self 측을 이미 했으므로(enemyV2Debuffs 는 적 번들 소유)
        //   헬퍼엔 현재 맵을 그대로 넘긴다 — 헬퍼는 tick 없이 cast+적용만 한다(이중 tick 방지).
        let castFired = false;
        if (V2_ATB_SKILLS) {
          const prevLogLen = state.log.length;
          const cast = applyPlayerV2SkillCast(state, atbPlayer, {
            selfBuffs: state.v2SelfBuffs,
            selfDebuffs: state.v2SelfDebuffs,
            enemyDebuffs: state.enemyV2Debuffs,
          });
          state = cast.state;
          castFired = cast.castFired;
          castSelfHastePct = cast.selfHastePct;
          if (cast.enemyDelayPct > 0) {
            // 대지 — 적의 다음 행동(enemyNextTick 에 예약됨)을 적 인터벌의 pct% 만큼 뒤로 민다.
            enemyNextTick +=
              actionInterval(effectiveEnemyTimelineSpd(state, depthCorr)) *
              (cast.enemyDelayPct / 100);
          }
          if (state.enemyHp <= 0) {
            // 시전으로 적 처치 — 플레이어 관점 승리(ATB 평타 처치 로그와 동형).
            state = {
              ...state,
              log: appendLog(state.log, {
                kind: "info",
                text: `${state.enemy.name}을(를) 쓰러뜨렸다!`,
                turn: "player",
              }),
              outcome: "win",
              phase: "ended",
            };
          } else if (castFired) {
            // 시전 = 완료한 플레이어 턴. legacy XOR 분기와 동일하게 턴 플래그 리셋 +
            //   completedPlayerTurns +1 + finishPlayerTurn(턴 종료 효과). 평타 루프는 아래에서 스킵.
            const ended: BattleState = {
              ...state,
              phase: "enemy",
              playerAttacksLeft: rollPlayerAttackCountWithBleed(state, atbPlayer),
              turn: {
                ...state.turn,
                completedPlayerTurns: state.turn.completedPlayerTurns + 1,
                doubleStrikeUsedThisTurn: false,
                lightspeedUsedThisTurn: false,
                critThisTurn: false,
                riposteUsedThisTurn: false,
                firstAttackPending: true,
                galeChainsThisTurn: 0,
                weakpointUsedThisTurn: false,
                fatedChainTriggeredThisTurn: false,
              },
            };
            state = finishPlayerTurn(ended, atbPlayer, playerName);
          }
          // 틱 스탬프는 cast + 처치 승리 로그 + finishPlayerTurn(재생/격노 등) 로그를 모두 포함하도록
          //   이 시점에서 한 번에 — 위 분기들이 prevLogLen 이후로 append 한 엔트리가 t 누락(외톨이 박스)
          //   되지 않게 한다(Codex PR-B 리뷰). tagNewLogEntries 는 이미 찍힌 t 는 보존(멱등).
          state = tagNewLogEntries(state, prevLogLen, "player", nextTick);
        }
        if (state.phase !== "ended" && !castFired) {
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
          state = tagNewLogEntries(state, prevLogLen, "player", nextTick);
          action = { kind: "attack" };
          if (state.phase === "ended") break;
        }
        }
      }
      // 바람 — 이번 행동 후 내 다음 행동 틱을 가속(pct% 만큼 단축). 미시전이면 0 → 무변.
      playerNextTick +=
        actionInterval(effectivePlayerSpd(atbPlayer, state)) *
        (1 - castSelfHastePct / 100);
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
      const enemyBundleStart = state.log.length;
      state = tickEnemyBundleEntry(state);
      // 적 번들 틱(DoT/사망)도 동일 — t 미스탬프 외톨이 박스 방지(같은 nextTick 윈도우).
      state = stampTick(state, enemyBundleStart, nextTick);
      if (state.phase !== "ended") {
        // Phase-1 limitation: enemyV2Debuffs ownership and enemy v2 skill casts remain legacy-loop concerns.
        // Phase-1 limitation: Shadow Step is still evaluated by the helper per enemy bundle, not per individual hit.
        while (state.phase === "enemy") {
          const prevLogLen = state.log.length;
          state = resolveEnemyPhase(state, atbPlayer, playerName, false);
          state = tagNewLogEntries(state, prevLogLen, "enemy", nextTick);
          if (state.phase === "ended") break;
          if (state.turn.enemyAttacksLeft <= 0) state = finishEnemyAttack(state);
        }
      }
      enemyNextTick += actionInterval(effectiveEnemyTimelineSpd(state, depthCorr));
    }

    if (state.phase !== "ended") {
      state = {
        ...state,
        log: appendLog(state.log, hpBarEntry(state, nextTick)),
      };
    }
  }

  return {
    outcome: state.outcome!,
    finalState: { ...state, log: appendLog(state.log, hpBarEntry(state, lastTick)) },
    potionsConsumed: consumed,
    turns,
  };
}
