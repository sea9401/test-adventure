// 투기장 코인 상점 카탈로그 — 투기장 코인(pvp-wallet.v1)으로 구매. 전부 코스메틱(칭호) —
// 주간 시즌 순위 보상 화폐의 소비처. 영구 파워템은 두지 않는다(보조적 사이드 컨텐츠 취지).
// 서버(구매 검증)와 클라(상점 UI)가 같은 표를 본다. (낚시 코인 상점 fishingShop.ts 미러.)
//
// 새 품목 추가 시: titles.ts 에 칭호 정의(category "pvp") + 여기 { titleId, price } 한 줄.

import { TITLES, type TitleId } from "@/adventure/data/titles";

export type ArenaShopTitle = {
  titleId: TitleId;
  price: number;
};

export const ARENA_SHOP_TITLES: readonly ArenaShopTitle[] = [
  { titleId: "pvp_gladiator", price: 200 },
  { titleId: "pvp_veteran", price: 600 },
  { titleId: "pvp_overlord", price: 1200 },
  { titleId: "pvp_legend", price: 2500 },
];

/** 카탈로그에 등재된 titleId → 가격. 미등재면 undefined(구매 불가). */
export function arenaShopPriceFor(titleId: string): number | undefined {
  return ARENA_SHOP_TITLES.find((t) => t.titleId === titleId)?.price;
}

/** 상점 노출용 — 이름·설명·가격 합본. titles.ts 에 정의 없으면 제외(방어). */
export function arenaShopEntries(): {
  titleId: string;
  name: string;
  description: string;
  price: number;
}[] {
  return ARENA_SHOP_TITLES.filter((t) => TITLES[t.titleId]).map((t) => ({
    titleId: t.titleId,
    name: TITLES[t.titleId].name,
    description: TITLES[t.titleId].description,
    price: t.price,
  }));
}
