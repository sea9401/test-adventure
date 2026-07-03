// 지도 조각 저장 모델 + 드랍 — 낚시(주 경로)·사냥(트리클)에서 모은 조각이 쌓여
// 발굴 지점을 연다.
//
// 설계: docs/treasure-hunt-plan.md §2
// 조각 FRAGMENTS_PER_MAP 개 = 발굴 1회. 실제 소비(발굴 지점 개방)는 PR-3.
// 순수 모듈 — 서버(드랍 배선)·클라(진척 표시) 공용. 드랍은 100% 서버 rng(위조 불가).

export const TREASURE_FRAGMENTS_KEY = "treasure-fragments.v1";

/** 발굴 1회에 필요한 지도 조각 수. (다이얼) */
// 2026-06-12 사용자 조정: 5→50 (조각 획득량 대비 발굴이 너무 잦음 — 판매 ×100 과 세트).
export const FRAGMENTS_PER_MAP = 50;

/** 지도 제작소 레벨별 발굴 지도 조각 비용 할인율. */
export const MAP_WORKSHOP_FRAGMENT_DISCOUNT_PCT: Record<number, number> = {
  0: 0,
  1: 5,
  2: 10,
  3: 15,
  4: 20,
  5: 25,
};

/** 낚시 챔질 성공 시 조각 드랍 확률 — 주 경로. (다이얼) */
export const FISHING_FRAGMENT_DROP_CHANCE = 0.12;

/** 사냥 승리 시 조각 드랍 확률 — 트리클(스태미나 게이트로 자연 제한). (다이얼) */
export const HUNT_FRAGMENT_DROP_CHANCE = 0.04;

export type TreasureFragments = { fragments: number };

export const emptyTreasureFragments = (): TreasureFragments => ({ fragments: 0 });

export function parseTreasureFragments(raw: unknown): TreasureFragments {
  if (!raw || typeof raw !== "object") return emptyTreasureFragments();
  const r = raw as Record<string, unknown>;
  const f = r.fragments;
  const fragments =
    typeof f === "number" && Number.isFinite(f) ? Math.max(0, Math.floor(f)) : 0;
  return { fragments };
}

// 조각 추가(순수). 양의 정수만 더한다.
export function addFragments(
  state: TreasureFragments,
  n: number,
): TreasureFragments {
  if (!Number.isFinite(n) || n <= 0) return state;
  return { fragments: state.fragments + Math.floor(n) };
}

/** 조립 가능한 발굴 횟수 = floor(조각 / K). (소비는 PR-3.) */
export function assemblableMaps(state: TreasureFragments): number {
  return Math.floor(state.fragments / FRAGMENTS_PER_MAP);
}

export function mapWorkshopFragmentDiscountPct(level: number): number {
  const safe = Math.max(0, Math.min(5, Math.floor(Number(level) || 0)));
  return MAP_WORKSHOP_FRAGMENT_DISCOUNT_PCT[safe] ?? 0;
}

export function fragmentsRequiredForMapWorkshopLevel(level: number): number {
  const discountPct = mapWorkshopFragmentDiscountPct(level);
  return Math.max(1, Math.ceil(FRAGMENTS_PER_MAP * (100 - discountPct) / 100));
}

// 발굴 1회분(K개) 조각 소비(순수). 부족하면 null. 발굴 지점 개방(PR-3 open)에서 사용.
export function spendOneMap(state: TreasureFragments): TreasureFragments | null {
  return spendOneMapWithCost(state, FRAGMENTS_PER_MAP);
}

export function spendOneMapWithCost(
  state: TreasureFragments,
  cost: number,
): TreasureFragments | null {
  const needed = Math.max(1, Math.floor(Number(cost) || FRAGMENTS_PER_MAP));
  if (state.fragments < needed) return null;
  return { fragments: state.fragments - needed };
}

// 드랍 굴림 — 성공 시 1개. rng() ∈ [0, 1). chance 는 [0,1] 클램프.
export function rollFragmentDrop(rng: () => number, chance: number): 0 | 1 {
  const c = Math.max(0, Math.min(1, chance));
  return rng() < c ? 1 : 0;
}
