// v2 hunt 응답의 replay 페이로드 — BattleScene 이 실제로 보는 필드만 보냄.
//
// 옛 응답은 BattleState 통째였는데 turn/flags/buffs/stacks 같은 안 보는
// 무거운 객체까지 따라와서 size 비대 위험. 여기서 필요 필드만 추출,
// 클라가 BattleScene 에 줄 때 안 보는 필드는 minimal default 로 padding.

import type {
  BattleLogEntry,
  BattleState,
} from "@/adventure/battle/engine";
import type { Monster } from "@/adventure/data/monsters/types";

// enemy.image = v2 사냥터 전용 초상화 경로. BattleScene 이 이걸 우선 쓰고, 없으면
// 클라 MONSTERS 카탈로그(`MONSTERS[name]?.image`)로 폴백한다.
export type ReplayPayload = {
  enemy: {
    name: string;
    hp: number; // max HP
    image?: string;
  };
  playerMaxHp: number;
  // v2 마법 시스템 풀 max (INT 0 이면 0).
  playerMaxMp: number;
  // 전투 종료 시점 잔여 MP — 마법 스킬 소비 반영. HP 와 마찬가지로 "끝난 상태" 표시.
  // 옛 payload(이전 배포본의 열어 둔 탭)엔 없을 수 있어 optional.
  playerMp?: number;
  log: BattleLogEntry[];
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

// 서버 — finalState 에서 필요 필드만 추출.
export function toReplayPayload(
  finalState: BattleState,
  logCap: number,
): ReplayPayload {
  return {
    enemy: {
      name: finalState.enemy.name,
      hp: finalState.enemy.hp,
      image: finalState.enemy.image,
    },
    playerMaxHp: finalState.playerMaxHp,
    playerMaxMp: finalState.playerMaxMp,
    playerMp: finalState.playerMp,
    log: clampReplayLog(finalState.log, logCap),
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
    ap: 0,
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
