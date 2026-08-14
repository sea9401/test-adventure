// v2 hunt 응답의 replay 페이로드 — BattleScene 이 실제로 보는 필드만 보냄.
//
// 옛 응답은 BattleState 통째였는데 turn/flags/buffs/stacks 같은 안 보는
// 무거운 객체까지 따라와서 size 비대 위험. 여기서 필요 필드만 추출,
// 클라가 BattleScene 에 줄 때 안 보는 필드는 minimal default 로 padding.

import type { BattleLogEntry, BattleState } from "@/adventure/v2/combat/engine";
import {
  BOSS_MAX_HP_DAMAGE_MULT,
  type PlayerCombat,
} from "@/adventure/v2/combat/engineState";
import {
  depthSpdCorrection,
  monsterActionSpd,
} from "@/adventure/v2/combat/combatTimeline";
import type { Monster } from "@/adventure/data/monsters/types";
import type { V2Element } from "@/adventure/data/v2/elements";

export type ReplayCombatStats = {
  atk: number;
  def: number;
  magicDef?: number;
  spd: number;
  accuracy?: number;
  evasionPct?: number;
  evaRating?: number;
  critChancePct?: number;
  magicAtk?: number;
  magicBarrierMax?: number;
  magicBarrierAbsorbPct?: number;
  magicBarrierEfficiencyPct?: number;
  bonusAttackChancePct?: number;
  statusDamageReductionPct?: number;
  primaryAttack?: "physical" | "magic";
};

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
    magicDef?: number;
    spd?: number;
    actionSpd?: number;
    accuracy?: number;
    evasionPct?: number;
    atkType?: Monster["atkType"];
    critPct?: number;
    bonusAttackChancePct?: number;
    statusDamageReductionPct?: number;
  };
  playerCombat?: ReplayCombatStats;
  ruleset?: "pve" | "pvp";
  /** 중독처럼 최대 HP 비례인 지속 피해 성분에만 적용하는 콘텐츠 배율. */
  maxHpDamageMult?: number;
  playerMaxHp: number;
  // v2 마법 시스템 풀 max (INT 0 이면 0).
  playerMaxMp: number;
  // 전투 종료 시점 잔여 MP — 마법 스킬 소비 반영. HP 와 마찬가지로 "끝난 상태" 표시.
  // 옛 payload(이전 배포본의 열어 둔 탭)엔 없을 수 있어 optional.
  playerMp?: number;
  // 전투 종료 시점 적 MP. 예전 저장 리플레이에는 없을 수 있으므로 optional이며,
  // 복원할 때는 로그의 마지막 HP/MP 스냅샷으로 폴백한다.
  enemyMp?: number;
  enemyMaxMp?: number;
  // 묶음 결과는 전체 로그를 별도 저장한다. log=[]이고 replayId가 있으면 클라이언트가
  // /api/v2/battle-replays/[replayId]에서 전체 payload를 지연 조회한다.
  replayId?: string;
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

type ReplayPayloadOptions = {
  depth?: number;
  playerCombat?: PlayerCombat;
  logCap?: number;
};

function replayPlayerCombat(
  player: PlayerCombat,
  ruleset: "pve" | "pvp" = "pve",
): ReplayCombatStats {
  return {
    atk: player.atk,
    def: player.def,
    magicDef: player.magicDef,
    spd: player.spd,
    accuracy: player.accRating ?? player.accuracyPct,
    evasionPct: player.evasionPct,
    evaRating: player.evaRating ?? player.evasionPct,
    critChancePct: player.critChancePct,
    magicAtk: player.magicAtk,
    magicBarrierMax: player.magicBarrierMax,
    magicBarrierAbsorbPct:
      ruleset === "pvp"
        ? player.magicBarrierPvpAbsorbPct
        : player.magicBarrierAbsorbPct,
    magicBarrierEfficiencyPct:
      ruleset === "pvp"
        ? player.magicBarrierPvpEfficiencyPct
        : player.magicBarrierEfficiencyPct,
    statusDamageReductionPct: player.statusDamageReductionPct,
    primaryAttack: player.passiveMagicBasicAttack ? "magic" : "physical",
  };
}

// 긴 배치 전투는 마지막 기록만 응답하되, 잘린 턴의 중간부터 시작하지 않게 첫 턴
// 마커 전의 잔여 기록을 걷어낸다. 생략 안내는 로그가 잘렸다는 사실을 명확히 남긴다.
function clampReplayLog(log: BattleLogEntry[], cap: number): BattleLogEntry[] {
  if (log.length <= cap) return log;
  let tail = log.slice(-cap);
  const firstMarker = tail.findIndex((entry) => entry.kind === "turn_marker");
  if (firstMarker > 0) tail = tail.slice(firstMarker);
  return [{ kind: "info", text: "앞선 턴 기록 생략 (긴 전투)" }, ...tail];
}

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
    magicDef: enemy.magicDef,
    spd: enemy.spd,
    actionSpd: monsterActionSpd(enemy, depthCorr),
    accuracy: enemy.accuracy,
    evasionPct: enemy.evasionPct,
    atkType: enemy.atkType,
    critPct: enemy.critPct,
    bonusAttackChancePct: enemy.bonusAttackChancePct,
    statusDamageReductionPct: enemy.statusDamageReductionPct ?? 0,
  };
}

// 서버 — finalState 에서 필요 필드만 추출.
export function toReplayPayload(
  finalState: BattleState,
  options?: ReplayPayloadOptions,
): ReplayPayload {
  return {
    enemy: replayEnemy(finalState.enemy, options),
    ...(options?.playerCombat
      ? { playerCombat: replayPlayerCombat(options.playerCombat) }
      : {}),
    ruleset: "pve",
    maxHpDamageMult:
      finalState.maxHpDamageMult ??
      (finalState.isBoss ? BOSS_MAX_HP_DAMAGE_MULT : 1),
    playerMaxHp: finalState.playerMaxHp,
    playerMaxMp: finalState.playerMaxMp,
    playerMp: finalState.playerMp,
    enemyMp: finalState.enemyMp,
    enemyMaxMp: finalState.enemyMaxMp,
    log:
      options?.logCap == null
        ? finalState.log
        : clampReplayLog(finalState.log, options.logCap),
  };
}

// 기존 연습전 호출부용 명시적 별칭. 모든 사용자 다시보기가 이제 전체 로그를 보존하므로
// 일반 변환과 결과는 같다.
export function toFullReplayPayload(
  finalState: BattleState,
  options?: ReplayPayloadOptions,
): ReplayPayload {
  return toReplayPayload(finalState, options);
}

// 전체 payload를 별도 저장한 뒤 목록/묶음 응답에 넣는 가벼운 참조형. 전투 메타는 그대로라
// 결과 카드가 즉시 그려지고, 로그만 사용자가 열 때 내려받는다.
export function toDeferredReplayPayload(
  payload: ReplayPayload,
  replayId: string,
): ReplayPayload {
  return { ...payload, replayId, log: [] };
}

// PvP(아레나) 배틀 → ReplayPayload 변환. resolveBattlePvP 의 finalState 는 p1/p2 두 사이드 +
// actor-relative 로그(모든 공격이 kind:"player_attack" + side 태그)를 들고 있다. 기본 호출은
// "나=p1" 관점이지만, 방어자 전적 저장에는 p2 관점도 필요하므로 로그 레인과 hp_bar 를 선택한
// 사이드 기준으로 재매핑한다.
type PvpReplaySide = {
  maxHp: number;
  maxMp: number;
  mp: number;
  player?: PlayerCombat;
};

function replayPvpEnemy(
  name: string,
  side: PvpReplaySide,
): ReplayPayload["enemy"] {
  if (!side.player) return { name, hp: side.maxHp };
  const combat = replayPlayerCombat(side.player, "pvp");
  return {
    name,
    hp: side.maxHp,
    atk: combat.atk,
    def: combat.def,
    magicDef: combat.magicDef,
    spd: combat.spd,
    actionSpd: combat.spd,
    accuracy: combat.accuracy,
    evasionPct: combat.evaRating ?? combat.evasionPct,
    atkType: combat.primaryAttack,
    critPct: combat.critChancePct,
    bonusAttackChancePct: combat.bonusAttackChancePct,
    statusDamageReductionPct: combat.statusDamageReductionPct ?? 0,
  };
}
export function toPvpReplayPayloadForSide(
  finalState: {
    p1: PvpReplaySide;
    p2: PvpReplaySide;
    log: BattleLogEntry[];
  },
  perspective: "p1" | "p2",
  opponentName: string,
): ReplayPayload {
  const opponentSide = perspective === "p1" ? "p2" : "p1";
  const remapped: BattleLogEntry[] = finalState.log.map((e) => {
    if (e.kind === "hp_bar") {
      if (perspective === "p1") return e; // 이미 p1=player / p2=enemy 프레이밍
      return {
        ...e,
        turn: e.turn === "player" ? "enemy" : e.turn === "enemy" ? "player" : e.turn,
        playerHp: e.enemyHp,
        playerMaxHp: e.enemyMaxHp,
        enemyHp: e.playerHp,
        enemyMaxHp: e.playerMaxHp,
        playerMp: e.enemyMp,
        playerMaxMp: e.enemyMaxMp,
        enemyMp: e.playerMp,
        enemyMaxMp: e.playerMaxMp,
        playerSignatureResources: e.enemySignatureResources,
        enemySignatureResources: e.playerSignatureResources,
      };
    }
    if (e.kind === "turn_marker") return e;
    if (e.side === opponentSide) {
      return {
        ...e,
        kind: e.kind === "player_attack" ? "enemy_attack" : e.kind,
        turn: "enemy" as const,
      };
    }
    if (e.side === perspective) {
      return {
        ...e,
        kind: e.kind === "enemy_attack" ? "player_attack" : e.kind,
        turn: "player" as const,
      };
    }
    return { ...e, turn: e.turn ?? ("player" as const) };
  });
  const me = finalState[perspective];
  const opponent = finalState[opponentSide];
  return {
    enemy: replayPvpEnemy(opponentName, opponent),
    ...(me.player
      ? { playerCombat: replayPlayerCombat(me.player, "pvp") }
      : {}),
    ruleset: "pvp",
    maxHpDamageMult: 1,
    playerMaxHp: me.maxHp,
    playerMaxMp: me.maxMp,
    playerMp: me.mp,
    enemyMp: opponent.mp,
    enemyMaxMp: opponent.maxMp,
    log: remapped,
  };
}

export function toPvpReplayPayload(
  finalState: {
    p1: PvpReplaySide;
    p2: PvpReplaySide;
    log: BattleLogEntry[];
  },
  opponentName: string,
): ReplayPayload {
  return toPvpReplayPayloadForSide(finalState, "p1", opponentName);
}

// 로그가 필요 없는 서버 내부 시뮬레이션용 경량 payload. 전투 메타만 유지하고 log는 비운다.
// 사용자에게 제공하는 단판·묶음 다시보기는 모두 toReplayPayload의 전체 로그를 사용한다.
export function toReplayPayloadLite(
  finalState: BattleState,
  options?: ReplayPayloadOptions,
): ReplayPayload {
  return {
    enemy: replayEnemy(finalState.enemy, options),
    ...(options?.playerCombat
      ? { playerCombat: replayPlayerCombat(options.playerCombat) }
      : {}),
    ruleset: "pve",
    maxHpDamageMult:
      finalState.maxHpDamageMult ??
      (finalState.isBoss ? BOSS_MAX_HP_DAMAGE_MULT : 1),
    playerMaxHp: finalState.playerMaxHp,
    playerMaxMp: finalState.playerMaxMp,
    playerMp: finalState.playerMp,
    enemyMp: finalState.enemyMp,
    enemyMaxMp: finalState.enemyMaxMp,
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
  // 현재 payload 메타를 우선 사용한다. 배포 전에 저장된 리플레이는 적 MP 메타가 없지만
  // hp_bar에는 스냅샷이 남아 있으므로 마지막 값으로 복구해 0/0 오표시를 피한다.
  let enemyMp = payload.enemyMp;
  let enemyMaxMp = payload.enemyMaxMp;
  if (enemyMp == null || enemyMaxMp == null) {
    for (let i = payload.log.length - 1; i >= 0; i -= 1) {
      const entry = payload.log[i];
      if (entry.kind !== "hp_bar") continue;
      enemyMp ??= entry.enemyMp;
      enemyMaxMp ??= entry.enemyMaxMp;
      if (enemyMp != null && enemyMaxMp != null) break;
    }
  }
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
    enemyMp: enemyMp ?? 0,
    enemyMaxMp: enemyMaxMp ?? 0,
    playerV2Dots: [],
    enemyV2Dots: [],
  };
}
