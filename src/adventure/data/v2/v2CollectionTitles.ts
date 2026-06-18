// 수집 칭호 상점(A 메타 — 소비형 수집 포인트 sink). 순수 모듈(부수효과·DB 없음).
//
// 수집 포인트(= 모은 직업 패시브 수, countCollectedPassives)는 누적이라 등급(collectionRank)은
//   안 떨어진다. 칭호 구매는 "사용분"으로만 잡혀 잔액(available)에서 차감 — 프리셋 슬롯 sink 와
//   같은 풀을 공유한다. 즉 사용분 = presetSlotSpend(슬롯) + collectionTitleSpend(보유 칭호).
//   칭호는 순수 비파워 prestige(titles.ts 의 category "collection"). 영구 unlock.

import { presetSlotSpend } from "./v2LoadoutPresets";

/** 수집 칭호 상점 품목 — titleId(titles.ts) + 수집 포인트 비용. 점증(2→10)으로 후반 수집에 당근. */
export const COLLECTION_SHOP_TITLES: readonly { id: string; cost: number }[] = [
  { id: "coll_wanderer", cost: 2 },
  { id: "coll_jack", cost: 4 },
  { id: "coll_collector", cost: 6 },
  { id: "coll_polymath", cost: 8 },
  { id: "coll_pathmaster", cost: 10 },
];

const COST_BY_ID: ReadonlyMap<string, number> = new Map(
  COLLECTION_SHOP_TITLES.map((t) => [t.id, t.cost]),
);

/** 상점 품목인 칭호 id 인지. */
export function isCollectionShopTitle(id: string): boolean {
  return COST_BY_ID.has(id);
}

/** 칭호 1개의 비용. 상점 품목이 아니면 0. */
export function collectionTitleCost(id: string): number {
  return COST_BY_ID.get(id) ?? 0;
}

/** 보유 칭호 중 상점 품목의 비용 합 = 칭호로 사용한 수집 포인트. 비상점 칭호는 무시. */
export function collectionTitleSpend(ownedTitleIds: Iterable<string>): number {
  let sum = 0;
  for (const id of ownedTitleIds) sum += COST_BY_ID.get(id) ?? 0;
  return sum;
}

/**
 * 총 사용 수집 포인트 = 프리셋 슬롯(presetSlotSpend) + 칭호 구매(collectionTitleSpend).
 * 🔑 잔액(available) = 누적 수집 − 이 값. 두 sink 가 같은 풀을 쓰므로 모든 계산처가 이 함수로 일치.
 */
export function totalCollectionSpend(
  loadoutPresetSlotsBought: number,
  ownedTitleIds: Iterable<string>,
): number {
  return presetSlotSpend(loadoutPresetSlotsBought) + collectionTitleSpend(ownedTitleIds);
}
