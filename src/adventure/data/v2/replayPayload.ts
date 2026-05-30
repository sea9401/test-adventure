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
  // v2 마법 시스템 풀 max (INT 0 이면 0). PR-4+ 에서 마법 소비 들어오면 finalMp 추가 검토.
  playerMaxMp: number;
  log: BattleLogEntry[];
};

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
    log: finalState.log.slice(-logCap),
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
    // PR-4 까지 MP 소비 없음 — replay 시점에도 풀충전 그대로 표시.
    // 옛 payload(이전 배포본의 열어 둔 탭) 호환 — playerMaxMp 미존재 시 0.
    playerMp: payload.playerMaxMp ?? 0,
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
