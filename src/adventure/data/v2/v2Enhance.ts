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
// 2026-06-11 2차 하향(사용자): 초반 구간도 100%를 없애 첫 강부터 긴장 —
// +9→+10 은 30%(붉은 25%). 기대 비용 +10 1부위 ≈ 푸른 돌 43개(하락 미반영).
export const ENHANCE_SUCCESS_PCT: readonly number[] = [
  95, 90, 90, 85, 80, 70, 60, 50, 40, 30,
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

// ── 강화석 재료·드랍 (PR-2) ─────────────────────────────────────────────────
// 강화석은 V2_MATERIALS 카탈로그(dungeonDrops)에 등재된 재료 — 인벤 재료 탭·거래소
// 재료 거래·NPC 판매가 그대로 동작한다. 드랍은 V2_MATERIALS_ENABLED(제작 보류 플래그)와
// 무관한 hunt 라우트의 독립 롤 — 전 깊이 공통(초보자도 줍고 거래소에서 환금).
export const ENHANCE_STONE_MATERIAL_ID: Record<EnhanceStoneId, string> = {
  red: "v2_red_enhance_stone",
  blue: "v2_blue_enhance_stone",
};

// 승리당 드랍 확률(%) — 의도적으로 매우 희소(사용자 결정: "훨씬 귀하게").
// NPC 판매 없음 — 환금/수급은 거래소 유저 거래 전용(시세는 수요가 결정).
// 푸른 1개 ≈ 333승, 붉은 1개 ≈ 1,000승. +10 1부위 ≈ 돌 ~27개(성공률 반영 기대값).
export const ENHANCE_STONE_DROP_PCT: Record<EnhanceStoneId, number> = {
  red: 0.1,
  blue: 0.3,
};

// hunt 승리 보상 롤 — 색별 독립 굴림, 통과 시 1개. rng() ∈ [0,1).
export function rollEnhanceStoneDrops(
  rng: () => number,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const stone of ["red", "blue"] as const) {
    if (rng() * 100 < ENHANCE_STONE_DROP_PCT[stone]) {
      out[ENHANCE_STONE_MATERIAL_ID[stone]] = 1;
    }
  }
  return out;
}

// ── 실패 페널티 — 고강 하락 (사용자 결정 2026-06-11) ─────────────────────────
// 현재 레벨이 이 값 이상일 때 실패하면 강화 −1 하락(파괴 없음). 그 미만은 재료만 소실.
export const ENHANCE_DEMOTE_FROM_LEVEL = 6;

// 하락 시 누적 보너스 차감 — 단계별 사용 돌 기록을 안 남기므로 평균 비례 차감
// (bonusPct × (level−1)/level 반올림). level 1→0 은 미강화(undefined).
export function demoteEnhance(
  e: V2EnhanceState,
): V2EnhanceState | undefined {
  const level = e.level - 1;
  if (level <= 0) return undefined;
  return {
    level,
    bonusPct: Math.round((e.bonusPct * level) / e.level),
  };
}

// 강화 반영 위력 — 서버 derive 와 클라 카드(인벤토리/거래소/강화 UI)의 단일 출처.
export function enhancedPower(
  basePower: number,
  enhance: V2EnhanceState | undefined,
): number {
  if (!enhance || enhance.bonusPct <= 0) return basePower;
  return Math.floor(basePower * (1 + enhance.bonusPct / 100));
}
