// v2 hunt 응답의 replay 페이로드 — BattleScene 이 실제로 보는 필드만 보냄.
//
// 옛 응답은 BattleState 통째였는데 turn/flags/buffs/stacks 같은 안 보는
// 무거운 객체까지 따라와서 size 비대 위험. 여기서 필요 필드만 추출,
// 클라가 BattleScene 에 줄 때 안 보는 필드는 minimal default 로 padding.

import type {
  BattleLogEntry,
  BattleState,
} from "@/adventure/v2/combat/engine";
import {
  depthSpdCorrection,
  effectiveMonsterSpd,
} from "@/adventure/v2/combat/combatTimeline";
import type { Monster } from "@/adventure/data/monsters/types";
import type { V2Element } from "@/adventure/data/v2/elements";

// enemy.image = v2 사냥터 전용 초상화 경로. BattleScene 이 이걸 우선 쓰고, 없으면
// 클라 MONSTERS 카탈로그(`MONSTERS[name]?.image`)로 폴백한다.
export type ReplayPayload = {
  enemy: {
    name: string;
    hp: number; // max HP
    image?: string;
    // PR-속성표시 — 전투 화면에 몹 속성 뱃지. neutral/undefined 면 표시 안 함.
    element?: V2Element;
    // 전투 스탯 — 전투창 적 칸 공/방/속(+상세) 표기용. 옛 payload(이전 배포본·PvP)엔
    //   없을 수 있어 optional — 없으면 BattleScene 이 스탯 줄을 생략(크래시 방지).
    atk?: number;
    def?: number;
    spd?: number;
    actionSpd?: number;
    accuracy?: number;
    evasionPct?: number;
    atkType?: Monster["atkType"];
    critPct?: number;
    bonusAttackChancePct?: number;
  };
  playerMaxHp: number;
  // v2 마법 시스템 풀 max (INT 0 이면 0).
  playerMaxMp: number;
  // 전투 종료 시점 잔여 MP — 마법 스킬 소비 반영. HP 와 마찬가지로 "끝난 상태" 표시.
  // 옛 payload(이전 배포본의 열어 둔 탭)엔 없을 수 있어 optional.
  playerMp?: number;
  log: BattleLogEntry[];
};

// 공격 기록(outpost_claim_attempts.replay) 저장용 봉투 — payload 만으로는 "player"
// 사이드가 누구인지 알 수 없어 표시 정보를 함께 스냅샷. claim 공격이면 공격자,
// NPC 정기 공격이면 점령자(수비) 시점이다.
export type StoredReplayEnvelope = {
  payload: ReplayPayload;
  playerName: string;
  // 프로필 아바타 성별 — 없으면 클라가 기본값 폴백 (NPC 정기 공격 등).
  gender?: string;
};

// 로그를 마지막 logCap 개로 자르되, 잘렸으면 깔끔하게 — 첫 turn_marker 앞의 잘린-턴 잔여
// entry 를 떼어내(머리 없는 그룹 방지) 첫 그룹이 항상 "N턴" 헤더로 시작하게 하고, "앞선 턴 생략"
// 안내를 맨 앞에 끼운다(전투가 끊긴 게 아니라 긴 전투의 뒷부분임을 명시). cap 이하면 원본 그대로.
// 참고: 자른 경우 생략 안내는 의도적으로 *항상* 맨 앞에 붙인다 — tail 이 이미 turn_marker 로
// 깔끔히 시작(firstMarker===0)하더라도 "앞이 생략됐다"는 신호 자체가 목적이라 그대로 붙인다.
export function clampReplayLog(
  log: BattleLogEntry[],
  cap: number,
): BattleLogEntry[] {
  if (log.length <= cap) return log;
  let tail = log.slice(-cap);
  const firstMarker = tail.findIndex((e) => e.kind === "turn_marker");
  if (firstMarker > 0) tail = tail.slice(firstMarker);
  return [{ kind: "info", text: "앞선 턴 기록 생략 (긴 전투)" }, ...tail];
}

type ReplayPayloadOptions = {
  depth?: number;
};

function replayEnemy(
  enemy: BattleState["enemy"],
  options?: ReplayPayloadOptions,
): ReplayPayload["enemy"] {
  const depthCorr =
    options?.depth != null ? depthSpdCorrection(options.depth) : 0;
  return {
    name: enemy.name,
    hp: enemy.hp,
    image: enemy.image,
    element: enemy.element,
    atk: enemy.atk,
    def: enemy.def,
    spd: enemy.spd,
    actionSpd: effectiveMonsterSpd(enemy.spd, depthCorr),
    accuracy: enemy.accuracy,
    evasionPct: enemy.evasionPct,
    atkType: enemy.atkType,
    critPct: enemy.critPct,
    bonusAttackChancePct: enemy.bonusAttackChancePct,
  };
}

// 서버 — finalState 에서 필요 필드만 추출.
export function toReplayPayload(
  finalState: BattleState,
  logCap: number,
  options?: ReplayPayloadOptions,
): ReplayPayload {
  return {
    enemy: replayEnemy(finalState.enemy, options),
    playerMaxHp: finalState.playerMaxHp,
    playerMaxMp: finalState.playerMaxMp,
    playerMp: finalState.playerMp,
    log: clampReplayLog(finalState.log, logCap),
  };
}

// PvP(아레나) 배틀 → ReplayPayload 변환. resolveBattlePvP 의 finalState 는 p1/p2 두 사이드 +
// actor-relative 로그(모든 공격이 kind:"player_attack" + side 태그)를 들고 있다. 호출부는 항상
// "나=p1" 관점이므로(arena: myPlayer 가 p1), side==="p2" 엔트리를 적 레인으로 재매핑한다
// (player_attack→enemy_attack, turn→enemy). hp_bar 는 엔진이 이미 playerHp=p1·enemyHp=p2 로
// 채워 그대로 둔다. enemy.hp = 상대 maxHp(바 분모), playerMax* = p1 사이드 값.
type PvpReplaySide = { maxHp: number; maxMp: number; mp: number };
export function toPvpReplayPayload(
  finalState: {
    p1: PvpReplaySide;
    p2: { maxHp: number };
    log: BattleLogEntry[];
  },
  opponentName: string,
  logCap: number,
): ReplayPayload {
  const remapped: BattleLogEntry[] = finalState.log.map((e) => {
    if (e.kind === "hp_bar") return e; // 이미 p1=player / p2=enemy 프레이밍
    if (e.side === "p2") {
      // 상대(p2) 액터 → 적 레인. 공격은 enemy_attack 으로, info/phase 는 kind 유지 + turn 만 enemy.
      return {
        ...e,
        kind: e.kind === "player_attack" ? "enemy_attack" : e.kind,
        turn: "enemy" as const,
      };
    }
    // p1(나)·미태그(turn_marker 등) → 플레이어 레인. turn_marker 는 사이드 없는 헤더라 그대로.
    return e.kind === "turn_marker"
      ? e
      : { ...e, turn: e.turn ?? ("player" as const) };
  });
  return {
    enemy: { name: opponentName, hp: finalState.p2.maxHp },
    playerMaxHp: finalState.p1.maxHp,
    playerMaxMp: finalState.p1.maxMp,
    playerMp: finalState.p1.mp,
    log: clampReplayLog(remapped, logCap),
  };
}

// 일괄(batch) 사냥용 경량 payload — 클라 배치 집계는 playerMaxMp 만 읽고 log/enemy 는 버린다.
//   full toReplayPayload 의 clampReplayLog(최대 200 entry slice + scan)을 건너뛰어 판마다 발생하던
//   로그 복사/할당을 없앤다. log 는 [](미사용). 단판(count===1)은 full payload 그대로 — 무변경.
export function toReplayPayloadLite(
  finalState: BattleState,
  options?: ReplayPayloadOptions,
): ReplayPayload {
  return {
    enemy: replayEnemy(finalState.enemy, options),
    playerMaxHp: finalState.playerMaxHp,
    playerMaxMp: finalState.playerMaxMp,
    playerMp: finalState.playerMp,
    log: [],
  };
}

// 클라 — BattleScene 에 줄 BattleState 만들기. 안 보는 필드는 minimal default.
// BattleScene 이 보는 필드 = enemy.{name,hp,image}, enemyHp, playerHp, playerMaxHp, log.
// 그 외(phase/turn/flags/buffs/stacks/etc) 는 안 보지만 type 상 required 라
// `as BattleState["xxx"]` 로 cast (BattleTurnState 변경되어도 깨지지 않게).
export function buildBattleStateFromReplay(
  payload: ReplayPayload,
  playerHp: number,
  enemyHp: number,
): BattleState {
  return {
    enemy: payload.enemy as Monster,
    enemyHp,
    playerHp,
    playerMaxHp: payload.playerMaxHp,
    // 전투 종료 시점 잔여 MP. 옛 payload(playerMp 미존재) 는 max 로 폴백해 풀로 표시.
    playerMp: payload.playerMp ?? payload.playerMaxMp ?? 0,
    playerMaxMp: payload.playerMaxMp ?? 0,
    log: payload.log,
    phase: "ended",
    outcome: null,
    playerAttacksLeft: 0,
    turn: {} as BattleState["turn"],
    flags: {} as BattleState["flags"],
    buffs: {} as BattleState["buffs"],
    stacks: {} as BattleState["stacks"],
    // PR-4a — replay 는 끝난 상태 표시만 하므로 빈 v2 스킬 상태로 충분.
    v2Skills: { learned: [], equipped: [] },
    v2SkillCooldowns: {},
    v2SelfBuffs: {},
    v2SelfDebuffs: {},
    enemyV2SelfBuffs: {},
    enemyV2Debuffs: {},
    enemyV2Skills: { learned: [], equipped: [] },
    enemyV2SkillCooldowns: {},
    enemyMp: 0,
    enemyMaxMp: 0,
    playerV2Dots: [],
    enemyV2Dots: [],
  };
}
