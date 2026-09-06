import { type PotionId } from "@/adventure/data/potions";
import {
  type BattleOutcome,
  type BattleState,
  type BossMechanicContext,
  type PlayerAction,
} from "./engineState";

// 방어 관통 비율 — 암살/약점 적중/DEF무시 AP 스킬이 무시하는 적 DEF 비율.
// 2026-05-23: 완전 무시(DEF 0)가 "선턴 이김"·방어 무력화의 주범이라, 0.3(30%)만 무시하도록
// 완화. 방어 투자가 70% 는 항상 유효. (정확 스킬의 비례 관통도 같은 0.3 캡 — skills.ts)
export const DEF_IGNORE_FRACTION = 0.3;


// 한 전투를 시작부터 끝까지 한 번에 시뮬한다. 결과(최종 상태 + 로그 + 턴 수 + 소비된 포션)만
// 반환하므로 실시간 UI/오프라인 시뮬 양쪽에서 동일하게 사용 가능.
//
// `pickAction`은 player phase에서 호출. 포션 사용 결정 시 호출 측에서 보유량 체크 X —
// 함수 내부에서 잔량을 추적하고 부족하면 attack으로 폴백한다.
export type ResolveContext = {
  /** Summary retains current-action events for mechanics, discarding completed history. */
  logMode?: "full" | "summary";
  /** Optional stream for synchronous repeatable simulations; omitted preserves live RNG. */
  random?: () => number;
  pickAction: (state: BattleState) => PlayerAction;
  potions: Partial<Record<PotionId, number>>;
  // 보스 전투면 BOSS_TURN_CAP 턴 경과 시 패배로 타임아웃. 일반 전투에는 영향 없음.
  isBoss?: boolean;
  // 협동 보스 등에서 최대 HP 비례 지속 피해 성분만 별도 감산할 때 사용한다.
  // isBoss 기본값은 BOSS_MAX_HP_DAMAGE_MULT(0.8), 미지정 일반 전투는 1.
  maxHpDamageMult?: number;
  // 전투 시작 로그에 박을 안내 한 줄(전술 등). 호출부가 문자열로 빌드해 넘긴다
  // (엔진은 stance 를 모름 — 순환 의존 회피). 미지정이면 추가 안 함.
  openingNote?: string;
  // v2 스킬 상태 (PR-4a) — saves_kv "skills.v2" 의 learned/equipped. 미지정/빈 배열이면
  // v2 스킬 cast no-op. 라우트가 saves_kv 에서 읽어 넘긴다.
  v2Skills?: import("@/adventure/data/v2/v2Skills").V2SkillsState;
  // 밸런스 시뮬레이터·엔진 테스트 전용. 빌드 환경 플래그와 무관하게 양쪽 ATB 스킬을 켠다.
  // 일반 게임 호출부는 넘기지 않으며, 라이브 동작은 V2_ATB_SKILLS 설정을 그대로 따른다.
  forceAtbSkills?: boolean;
  // 무한 루프 가드 턴 상한(플레이어 턴 기준). 미지정이면 500(기본 안전캡). 스파링처럼
  // "안 죽는 샌드백을 N턴만 두들기는" 용도면 낮춰 넘긴다(예: 50) — 도달 시 lose 로 종료.
  maxTurns?: number;
  // 던전 깊이 — ATB(코어루프) 전용. 몬스터 SPD 깊이 보정(depthSpdCorrection)에 쓴다. 미지정/
  // 비-던전 전투(토벌·협동보스 등)면 보정 0. 레거시 엔진은 무시(flag-off byte-identical).
  depth?: number;
  // 공유 HP 보스처럼 최대 HP(enemy.hp)와 전투 시작 현재 HP가 다른 경우 사용.
  // 미지정이면 enemy.hp에서 시작한다.
  initialEnemyHp?: number;
  /** 적 처치로 끝내지 않고 실제 판정 피해를 누적하는 토벌전 전용 계측 모드. */
  damageMeter?: { continueAfterDefeat: true; refillHp: number };
  bossMechanic?: BossMechanicContext;
};

// 보스 전투 타임아웃 — 플레이어 턴 기준. 정상 빌드는 10~30턴 안에 끝나므로
// 50턴 도달은 데미지 부족 / 무한 회피 스톨로 간주, 패배 처리.
export const BOSS_TURN_CAP = 50;

export const NORMAL_MONSTER_EXECUTION_HP_FRACTION = 0.35;

export const NORMAL_MONSTER_EXECUTION_HP_PCT = 35;

export type BattleResolution = {
  outcome: BattleOutcome;
  /** 전투 상한에 도달해 강제 종료된 경우. 사냥에서는 무승부성 패배로 판정한다. */
  endReason?: "timeout";
  finalState: BattleState;
  potionsConsumed: Partial<Record<PotionId, number>>;
  turns: number;
  /** 토벌전 피해 계측 모드에서만 제공하는 구조화된 총피해. */
  damageDealtTotal?: number;
};
