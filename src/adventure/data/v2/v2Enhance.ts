// v2 장비 강화 — 다이얼 + 순수 헬퍼. 설계: docs/v2-equipment-enhance-plan.md
//
// 장비 개체(iid)당 +0→+ENHANCE_MAX_LEVEL. 효과는 위력만 곱연산(옵션·무게 불변) —
// 굴림(옵션 편차)과 직교하는 별도 진척 축. 매 강화마다 강화석 색을 선택:
//   붉은(맹렬) = 성공 시 +3%p·성공률 −10%p / 푸른(단단) = +2%p·보정 없음.
// 같은 +10 이라도 돌 구성에 따라 +20~30% — 개체 정체성·거래 가치.
//
// 실패 = 재료만 소실(레벨 하락·파괴 없음 — 소수 모수 캐주얼 서버 정책).
// 수급 = 사냥 드랍 전용(PR-2) — 초보자도 줍고 거래소에서 환금(베테랑 수요).

// ── 다이얼 (라이브 실측 후 캘리브) ──────────────────────────────────────────
export const ENHANCE_MAX_LEVEL = 10;

export type EnhanceStoneId = "red" | "blue";

export const ENHANCE_STONES: Record<
  EnhanceStoneId,
  { name: string; bonusPct: number; successDeltaPct: number }
> = {
  red: { name: "붉은 강화석", bonusPct: 3, successDeltaPct: -10 },
  blue: { name: "푸른 강화석", bonusPct: 2, successDeltaPct: 0 },
};

// n→n+1 성공률(%) — 푸른 돌 기준. 붉은 돌은 successDeltaPct 적용(최저 MIN).
export const ENHANCE_SUCCESS_PCT: readonly number[] = [
  100, 100, 100, 100, 100, 90, 80, 65, 50, 35,
];
export const ENHANCE_SUCCESS_MIN_PCT = 25;

// 회당 강화석 비용(개) — +0~2: 1, +3~5: 2, +6~8: 3, +9: 4.
export function enhanceStoneCost(level: number): number {
  return 1 + Math.floor(Math.max(0, level) / 3);
}

// 회당 골드 수수료 — 위력·강 수치 비례(sink).
export function enhanceGoldCost(power: number, level: number): number {
  return Math.max(1, Math.floor(power * 2 * (level + 1)));
}

// 유니크 강화 비용 배수(강화석·골드 공통) — chase 는 드랍에서, 강화는 장기 투자.
export const ENHANCE_UNIQUE_COST_MULT = 2;

export function enhanceSuccessPct(
  level: number,
  stone: EnhanceStoneId,
): number {
  const base =
    ENHANCE_SUCCESS_PCT[Math.min(level, ENHANCE_SUCCESS_PCT.length - 1)] ?? 0;
  const adjusted = base + ENHANCE_STONES[stone].successDeltaPct;
  return Math.max(ENHANCE_SUCCESS_MIN_PCT, Math.min(100, adjusted));
}

// ── 개체 강화 상태 ──────────────────────────────────────────────────────────
// equipment.v2.owned[].enhance — 옵셔널(옛 세이브·미강화 = 부재 = 0). 표기 "+7 (19%)".
export type V2EnhanceState = {
  level: number;
  /** 누적 위력 보너스 %p — 돌 구성에 따라 level×2 ~ level×3. */
  bonusPct: number;
};

const MAX_BONUS_PCT = ENHANCE_MAX_LEVEL * ENHANCE_STONES.red.bonusPct;

// 방어 파스 — 손상/위조 세이브에서 클램프. 무의미(level 0 이하)면 undefined(=미강화).
export function parseEnhance(raw: unknown): V2EnhanceState | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as { level?: unknown; bonusPct?: unknown };
  const levelN = typeof r.level === "number" ? r.level : Number(r.level);
  const bonusN = typeof r.bonusPct === "number" ? r.bonusPct : Number(r.bonusPct);
  if (!Number.isFinite(levelN) || levelN <= 0) return undefined;
  const level = Math.min(ENHANCE_MAX_LEVEL, Math.floor(levelN));
  const bonusPct = Math.max(
    0,
    Math.min(MAX_BONUS_PCT, Number.isFinite(bonusN) ? Math.floor(bonusN) : 0),
  );
  return { level, bonusPct };
}

// 강화 반영 위력 — 서버 derive 와 클라 카드(인벤토리/거래소/강화 UI)의 단일 출처.
export function enhancedPower(
  basePower: number,
  enhance: V2EnhanceState | undefined,
): number {
  if (!enhance || enhance.bonusPct <= 0) return basePower;
  return Math.floor(basePower * (1 + enhance.bonusPct / 100));
}
