// 협동 보스 1회 공격 시뮬 — engine.ts 의 advanceTurn 을 N턴 굴려 누적 데미지·플레이어 HP 반영.
// 보스가 반격하므로 플레이어가 사망할 수 있다 (캐릭터 hp 0).
//
// 솔로 보스 BattleView 와 다른 점:
// - 1회 호출당 정해진 턴수만 (COOP_ATTACK_TURNS).
// - 보스 hp 는 호출자가 maxHp/현재hp 를 외부에서 관리 (시뮬은 stateless 데미지 산출).
// - 시뮬 결과의 enemyHp 변화량을 "플레이어가 가한 데미지" 로 환산.

import {
  advanceTurn,
  appendLog,
  initialBattleState,
  type BattleLogEntry,
  type BattleState,
  type PlayerCombat,
} from "@/adventure/v2/combat/engine";
import { AP_CAP } from "@/adventure/character/apSkills";
import { MONSTERS, type Monster } from "@/adventure/data/monsters";

export type CoopAttackResult = {
  damageDealt: number;
  damageTaken: number;
  finalPlayerHp: number;
  diedEarly: boolean;
  log: BattleLogEntry[];
};

export type CoopAttackInput = {
  player: PlayerCombat;
  playerName: string;
  /** 보스 monster 키 — MONSTERS 에서 stat 가져옴. */
  bossName: string;
  /** 협동 세션의 현재 hp (이 시뮬 시작 시점). */
  bossCurrentHp: number;
  /** 협동 세션의 maxHp (페이즈 트리거 비율 계산용). */
  bossMaxHp: number;
  /** 시뮬 턴수. 기본 COOP_ATTACK_TURNS. */
  turns: number;
};

/**
 * 1회 공격 시뮬:
 * - bossCurrentHp 부터 시작해 N턴 또는 한쪽 사망까지 진행.
 * - damageDealt = (시작 hp − 종료 hp) — 호출자가 세션 hp 를 차감하는 데 사용.
 * - 플레이어 사망 시 finalPlayerHp = 0.
 * - 보스 페이즈 트리거는 maxHp 기준으로 발동 (협동 큰 hp 에 맞춤).
 */
export function simulateCoopAttack(input: CoopAttackInput): CoopAttackResult {
  const baseMonster = MONSTERS[input.bossName];
  if (!baseMonster) {
    throw new Error(`unknown boss: ${input.bossName}`);
  }

  // 협동 hp 로 override — phaseTrigger 가 fraction 기반이라 maxHp 그대로 두면 동작.
  // engine.ts 는 enemy.hp 를 maxHp 로 취급해 phaseTrigger threshold 계산.
  const bossForBattle: Monster = { ...baseMonster, hp: input.bossMaxHp };

  let state = initialBattleState(
    { ...input.player },
    bossForBattle,
    input.playerName,
  );
  // 시작 시점 보스 hp 를 협동 세션의 현재 hp 로 덮어쓴다.
  // (initialBattleState 가 maxHp 로 시작하므로, 진행 중 세션은 그 차이만큼 감소된 상태로 입장)
  // 페이즈 트리거는 hp 비율로 implicit — 이미 threshold 아래면 발동된 것으로 간주.
  // (그렇지 않으면 매 공격마다 트리거 메시지가 다시 노출됨)
  const trigger = bossForBattle.phaseTrigger;
  const alreadyTriggered =
    !!trigger &&
    input.bossCurrentHp < bossForBattle.hp * trigger.hpFraction;
  state = {
    ...state,
    enemyHp: input.bossCurrentHp,
    isBoss: true,
    flags: { ...state.flags, phaseTriggered: alreadyTriggered },
    buffs: {
      ...state.buffs,
      enemyDefBonus: alreadyTriggered ? trigger.defBonus : 0,
    },
  };

  // resolveBattle 과 같은 hp_bar/turn_marker 규약 — BattleLogList 가 같은 컴포넌트로
  // 라이브/협동 양쪽 로그를 그린다. 협동 sim 이 advanceTurn 만 직접 돌리던 시절엔
  // 이 entry 들이 누락돼 협동 보스 펼친 로그에 체력바·AP 핍이 안 떴다.
  // AP 스킬 미장착자는 apMax=0 — UI 가 핍 영역 자체를 그리지 않는다.
  const apMaxForLog =
    (input.player.equippedAPSkills?.length ?? 0) > 0 ? AP_CAP : 0;
  const hpBarEntry = (s: BattleState): BattleLogEntry => ({
    kind: "hp_bar",
    text: "",
    turn: "player",
    playerHp: s.playerHp,
    playerMaxHp: s.playerMaxHp,
    enemyHp: s.enemyHp,
    enemyMaxHp: s.enemy.hp,
    ap: s.ap,
    apMax: apMaxForLog,
    playerMp: s.playerMp,
    playerMaxMp: s.playerMaxMp,
    enemyMp: s.enemyMp,
    enemyMaxMp: s.enemyMaxMp,
  });
  const turnMarkerText = (turnNo: number, ap: number): string =>
    `${turnNo}턴 · AP ${ap}`;

  // 초기 entry (적 등장 / 능력 안내 등) 는 player 턴으로 태깅 + "1턴" 마커 박기.
  // 선공자 캐시 — 사이클 정의가 선공자에 따라 달라진다 (resolveBattle 과 동일 규약).
  const playerFirstStrike = state.phase === "player";
  state = {
    ...state,
    log: [
      ...state.log.map((e) => ({ ...e, turn: "player" as const })),
      {
        kind: "turn_marker",
        text: turnMarkerText(1, state.ap),
        turn: "player" as const,
      },
    ],
  };

  const maxTurns = input.turns;

  // 턴 캡은 engine 의 completedPlayerTurns 로 잰다. advanceTurn 은 공격 한 번마다 호출되고
  // 다중공격(attackCount>=2, 연타, 광속, 풍사슬 등) 중간 공격도 phase=player 로 리턴하므로,
  // 예전처럼 "phase===player 면 +1" 식으로 카운트하면 사이클이 아닌 "공격 횟수" 를 세버려
  // 본타가 많을수록 시뮬이 일찍 잘렸다 (협동 보스 12턴 만에 끝나던 버그).
  while (
    state.phase !== "ended" &&
    state.turn.completedPlayerTurns < maxTurns &&
    state.playerHp > 0 &&
    state.enemyHp > 0
  ) {
    const prevPhase = state.phase;
    const prevLogLen = state.log.length;
    state = advanceTurn(state, input.player, input.playerName, { kind: "attack" });
    // advanceTurn 호출 직전의 phase 를 turn context 로 — 새 entry 들에 부여.
    if (state.log.length > prevLogLen) {
      const tagged = state.log.map((e, idx) =>
        idx < prevLogLen || e.turn ? e : { ...e, turn: prevPhase },
      );
      state = { ...state, log: tagged };
    }
    // 사이클 끝 — HP 스냅샷 + 다음 사이클 turn_marker. resolveBattle 과 같은 조건식.
    const cycleEnded = playerFirstStrike
      ? prevPhase === "enemy" && state.phase === "player"
      : prevPhase === "player" && state.phase === "enemy";
    if (cycleEnded && state.turn.completedPlayerTurns > 0) {
      const turnNo = state.turn.completedPlayerTurns + 1;
      state = {
        ...state,
        log: appendLog(appendLog(state.log, hpBarEntry(state)), {
          kind: "turn_marker",
          text: turnMarkerText(turnNo, state.ap),
          turn: "player",
        }),
      };
    }
  }

  // 종료 시점 마지막 HP 스냅샷 — 사용자가 펼친 로그의 마지막 줄로 결과를 확인.
  state = { ...state, log: appendLog(state.log, hpBarEntry(state)) };

  // log 추출 — engine 이 state.log 에 누적.
  const log: BattleLogEntry[] = [];
  for (const entry of state.log) log.push(entry);

  const damageDealt = Math.max(0, input.bossCurrentHp - state.enemyHp);
  const damageTaken = Math.max(0, input.player.hp - state.playerHp);

  return {
    damageDealt,
    damageTaken,
    finalPlayerHp: Math.max(0, state.playerHp),
    diedEarly: state.playerHp <= 0,
    log,
  };
}
