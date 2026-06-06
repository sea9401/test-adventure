// 캐릭터 레벨링 시스템.
// - 만렙 100.
// - 1차 가속(2026-06-07): L1~50 요구치 ×EARLY_LEVEL_EXP_FACTOR(0.25), 50→55 선형 복귀.
//   들판=1차(레벨 1~50) 디자인 — 1차 50까지 ≈ 1,750 사냥(스태미나). 아래 base 곡선 위에 곱해진다.
// - Lv 1~34: floor(120 * level^1.5).  Lv1→2 = 120 (×0.25 가속 후 30).
// - Lv 35~49: floor(120 * level^2.5 / 35) × (1.00→0.85 선형 램프).  35 경계 연속.
// - Lv 50~59: 위 곡선 × 0.85.
// - Lv 60~69: 위 곡선 × 0.85 × (1.00→1.30) 선형 램프. 엔드게임 진입.
// - Lv 70~89: 위 곡선 × 0.85 × (1.30→1.55) 선형 램프. 만렙 확장 컨텐츠 구간, 완만.
// - Lv 90~99: 위 곡선 × 0.85 × (1.55→2.00) 선형 램프. 막판 가파름.
// - 레벨업당 스탯 포인트 1점 획득(호출측에서 분배).
// 2026-05-19: 중후반 체감 완화 — Lv 35 이상에 ×0.85 적용. 35~49 는 연속성 유지를 위해
// 1.00→0.85 램프, 50 부터 풀반영. 누적 1→100 약 -14% (13.87M → 11.87M).
// 초반(1~34) 페이스는 유지. 파라곤 1pt 비용은 paragon.ts 에서 곡선과 분리된 고정 상수.

export const MAX_LEVEL = 100;

// 서버 전역 EXP 배율 — 테스트 서버용. 빌드 시 NEXT_PUBLIC_XP_RATE_MULT=2.5 처럼 주입.
// NEXT_PUBLIC_ 접두사라 클라/서버 양쪽에서 같은 값. 신참 ×2 와 길드 expMult 와는 곱해짐.
// 안전 범위 [0.1, 100] 클램프.
// 우선순위: NEXT_PUBLIC_XP_RATE_MULT(명시) > staging 기본(2.2) > 1.0.
//   staging(IS_STAGING="true")은 env 미설정 시 2.2 자동 — v2 만렙 페이스 ~37일/B(목표 30~40).
//   IS_STAGING 은 서버 전용이라 클라 번들에선 undefined → 1.0 이지만, XP_RATE_MULT 의 실제
//   적용처(v2 hunt route·battleClaim·questReward)가 모두 서버라 지급 EXP 는 일관(2.2). 라이브
//   (IS_STAGING≠true)는 기본 1.0 그대로라 영향 없음.
const STAGING_DEFAULT_XP_RATE = 2.2;
function parseXpRateMult(): number {
  const raw = process.env.NEXT_PUBLIC_XP_RATE_MULT;
  if (raw) {
    const n = Number.parseFloat(raw);
    if (Number.isFinite(n) && n > 0) return Math.min(100, Math.max(0.1, n));
  }
  if (process.env.IS_STAGING === "true") return STAGING_DEFAULT_XP_RATE;
  return 1;
}

export const XP_RATE_MULT = parseXpRateMult();

// 신참 보너스 — 30레벨 미만이면 사냥/퀘스트 EXP 가 ×2 + 드롭률 ×2.
// 레벨업으로 조건이 깨지는 순간 자동으로 꺼진다 (기존 캐릭터 포함).
export const NEWBIE_BONUS_LEVEL_THRESHOLD = 30;
export const NEWBIE_EXP_MULTIPLIER = 2;
export const NEWBIE_DROP_MULTIPLIER = 2;

export function isNewbieBonusActive(level: number): boolean {
  return level < NEWBIE_BONUS_LEVEL_THRESHOLD;
}

export function applyNewbieBonus(
  exp: number,
  level: number,
): { gained: number; bonusApplied: boolean } {
  if (exp <= 0 || !isNewbieBonusActive(level)) {
    return { gained: exp, bonusApplied: false };
  }
  return { gained: exp * NEWBIE_EXP_MULTIPLIER, bonusApplied: true };
}

// 드롭률 곱셈 — 신참이면 ×2, 아니면 ×1. 드롭 chance 계산 시 다른 멀티플라이어와 곱연산.
export function getNewbieDropMultiplier(level: number): number {
  return isNewbieBonusActive(level) ? NEWBIE_DROP_MULTIPLIER : 1;
}

// === v2 신참 보너스 — 레벨 대신 누적 전투 전적 기준 ===================
// 2026-06-03 사용자 결정 — v2 는 재전직 시 레벨이 1 로 리셋되므로(전직 prestige 루프)
// 레벨 < 30 으로 신참을 가리면 베테랑이 재전직할 때마다 보너스가 잘못 되살아난다.
// 그래서 v2 는 누적 전투 전적(처치+패배 = adventure-log.v2 의 kills 합 + battleLosses)
// 으로 가린다. 또 v2 는 EXP 만 ×2 (드롭 보너스 없음 — 사용자 결정).
export const NEWBIE_BONUS_BATTLE_THRESHOLD = 30000;

export function isNewbieBonusActiveByBattles(battleCount: number): boolean {
  return battleCount <= NEWBIE_BONUS_BATTLE_THRESHOLD;
}

// v2 사냥 EXP 신참 보너스 — 전적 ≤ 임계치면 ×2, 아니면 그대로. 드롭엔 미적용(EXP 전용).
export function applyNewbieExpBonusByBattles(
  exp: number,
  battleCount: number,
): { gained: number; bonusApplied: boolean } {
  if (exp <= 0 || !isNewbieBonusActiveByBattles(battleCount)) {
    return { gained: exp, bonusApplied: false };
  }
  return { gained: exp * NEWBIE_EXP_MULTIPLIER, bonusApplied: true };
}

// 35레벨 기준으로 지수를 1.5 → 2.5로 전환. 경계값이 동일하도록 계수를 맞춤:
// 120 * 35^1.5 = (120/35) * 35^2.5  →  계수 = 120 / 35.
const STEEP_LEVEL = 35;
const STEEP_COEFF = 120 / STEEP_LEVEL;
// 중후반 체감 완화 — Lv 35 부터 0.85 reduction. 단, 35 에서 곧장 ×0.85 로 떨어지면
// 1.5/2.5 power 가 35 경계에서 한참 거꾸로 가서 단조 증가가 깨진다.
// 35~49 에서 1.00 → 0.85 선형으로 램프시켜 연속성 유지, 50 부터 풀반영.
const REDUCTION_FLOOR = 0.85;
const REDUCTION_RAMP_END = 50;
function reductionMultiplier(level: number): number {
  if (level < STEEP_LEVEL) return 1;
  if (level >= REDUCTION_RAMP_END) return REDUCTION_FLOOR;
  const span = REDUCTION_RAMP_END - STEEP_LEVEL; // 15
  return 1 - (1 - REDUCTION_FLOOR) * ((level - STEEP_LEVEL) / span);
}

// 엔드게임 가산 — 기본 곡선에 구간별 선형 multiplier 를 곱한다.
// 각 구간 경계는 자연스럽게 연속 (시작값이 이전 구간 끝값과 매칭).
const ENDGAME_LEVEL = 60; // ×1.00 시작
const MID_ENDGAME_LEVEL = 70; // ×1.30 부터
const LATE_ENDGAME_LEVEL = 90; // ×1.55 부터

function endgameMultiplier(level: number): number {
  if (level < ENDGAME_LEVEL) return 1;
  if (level < MID_ENDGAME_LEVEL) {
    // Lv 60→69: 1.00 → 1.27 (다음 구간 시작값 1.30)
    return 1 + (level - ENDGAME_LEVEL) / 30;
  }
  if (level < LATE_ENDGAME_LEVEL) {
    // Lv 70→89: 1.30 → 1.5375 (다음 구간 시작값 1.55)
    return 1.3 + ((level - MID_ENDGAME_LEVEL) * 0.25) / 20;
  }
  // Lv 90→99: 1.55 → 1.3175 (막판 EXP 벽 완화 — L99 에서 -15%, L90 은 1.55 유지로 경계 점프 없음).
  // 종전엔 1.55→1.955 로 막판이 폭발 → "대기=진행" 의 진원지였다(game-fun-audit 2순위).
  return 1.55 - ((level - LATE_ENDGAME_LEVEL) * (1.55 * 0.15)) / 9;
}

// 유입(income) 밴드 배율 — EXP 페이싱 개편(game-fun-audit 2순위). monster.exp / 퀘스트 EXP
// 에 곱해 중후반 페이싱을 완화한다. 곡선(요구치)을 슬래시하는 대신 유입을 올리는 접근 —
// EXP 는 골드/드랍과 분리돼 있어 독립 상향이 안전하고, 기존 세이브 burst 위험이 없다.
// L1-29: 사용자 초반 가속 요청 (2026-05-28). 신참 ×2 와 곱해 ×3.0 효과.
//   sim-v2-exp-pacing 기준 1→25 시나리오 A 2.5일→1.7일, 시나리오 B 6.8일→4.5일.
//   "접속해서 stamina 만 쓰고 끄면 흥미 없음" 피드백 대응 — 초반 모멘텀 빠르게.
// battleClaim / offlineSim / questReward 세 EXP 소비 지점이 모두 이 헬퍼를 써야 한다
// (한 곳 누락 = 라이브/위탁/퀘 페이싱 불일치).
export function levelBandExpMultiplier(level: number): number {
  if (level < 30) return 1.5; // L1-29 (신참 ×2 와 곱해 ×3.0)
  if (level < 50) return 1.1; // L30-49
  if (level < 70) return 1.25; // L50-69
  if (level < 90) return 1.45; // L70-89
  return 1.55; // L90-100
}

// 1차 구간(L1~50) 페이싱 압축 — 들판=1차(레벨 1~50) 디자인에 맞춰 "1차 50까지 ≈ 1,500~2,000
// 스태미나(사냥)" 목표. 요구치를 ×EARLY_LEVEL_EXP_FACTOR(현 0.25 = ~4배 가속; sim 기준 1차 ~7,000
// → ~1,750 사냥). L50 까지 풀 적용, 50→55 에서 1.0 으로 선형 복귀(2차+ 가 1~50 통과 후 절벽 없이
// 원곡선 복귀; 2~4차 페이스는 후속 sim 캘리브 대상). EARLY_LEVEL_EXP_FACTOR 가 1차 속도 다이얼.
export const EARLY_LEVEL_EXP_FACTOR = 0.25;
const EARLY_RAMP_START = 50;
const EARLY_RAMP_END = 55;
function earlyLevelExpFactor(level: number): number {
  if (level <= EARLY_RAMP_START) return EARLY_LEVEL_EXP_FACTOR;
  if (level >= EARLY_RAMP_END) return 1;
  const span = EARLY_RAMP_END - EARLY_RAMP_START; // 5
  return (
    EARLY_LEVEL_EXP_FACTOR +
    (1 - EARLY_LEVEL_EXP_FACTOR) * ((level - EARLY_RAMP_START) / span)
  );
}

export function requiredExpToNext(level: number): number | null {
  if (level >= MAX_LEVEL) return null;
  if (level < 1) return null;
  const early = earlyLevelExpFactor(level);
  if (level < STEEP_LEVEL) {
    return Math.floor(120 * Math.pow(level, 1.5) * early);
  }
  const base = STEEP_COEFF * Math.pow(level, 2.5);
  return Math.floor(
    base * endgameMultiplier(level) * reductionMultiplier(level) * early,
  );
}

// EXP 누적 적용 + 자동 레벨업 처리.
// 누적 EXP가 다음 레벨 임계치를 넘으면 레벨업하고 다음 임계치로 계속 진행.
// 만렙 도달 시 잉여 EXP는 0으로 캡 — 잉여량은 `overflowExp` 로 분리 반환해
// 호출 측이 파라곤 등으로 라우팅할 수 있도록.
export function applyExpGain(
  level: number,
  exp: number,
  gain: number,
  // 레벨 상한 — 기본 만렙(100). v2 환생: 차수별 레벨캡(tierLevelCap)을 넘겨 차수 안에서만 성장.
  // 캡 도달 시 잉여 exp 는 overflowExp 로 반환되고 nextExp=0(버림, advance/환생 전까지 정지).
  maxLevel: number = MAX_LEVEL,
): {
  level: number;
  exp: number;
  levelsGained: number;
  /** 캡(maxLevel) 도달로 잘린 잉여 EXP. 캡 미도달이거나 정확히 임계치면 0. */
  overflowExp: number;
} {
  const cap = Math.min(MAX_LEVEL, Math.max(1, Math.floor(maxLevel)));
  let nextLevel = Math.max(1, Math.min(cap, level));
  let nextExp = Math.max(0, exp + gain);
  let levelsGained = 0;
  while (nextLevel < cap) {
    const need = requiredExpToNext(nextLevel)!;
    if (nextExp < need) break;
    nextExp -= need;
    nextLevel += 1;
    levelsGained += 1;
  }
  let overflowExp = 0;
  if (nextLevel >= cap) {
    overflowExp = nextExp;
    nextExp = 0;
  }
  return { level: nextLevel, exp: nextExp, levelsGained, overflowExp };
}

// UI 노출용 — 레벨별 필요 EXP 테이블.
export type LevelTableRow = {
  level: number;
  required: number;
  cumulative: number;
};

export function getLevelTable(): LevelTableRow[] {
  const rows: LevelTableRow[] = [];
  let cumulative = 0;
  for (let lv = 1; lv < MAX_LEVEL; lv += 1) {
    const required = requiredExpToNext(lv)!;
    cumulative += required;
    rows.push({ level: lv, required, cumulative });
  }
  return rows;
}
