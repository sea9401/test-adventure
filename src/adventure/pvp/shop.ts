// 투기장 상점 카탈로그 — 투기장 코인(pvp-wallet.v1)으로 구매. 전부 코스메틱(칭호) — 철회 전용
// 테마라 영구 파워템은 두지 않는다. 서버(구매 검증)와 클라(상점 UI)가 같은 표를 본다.
//
// 새 품목 추가 시: TITLES 에 칭호 정의(category "pvp") + 여기 { titleId, price } 한 줄.
// 가격은 코인 ~10/승·일일캡 100 기준 초안 — 후속 튜닝 다이얼.

import { TITLES, type TitleId } from "../data/titles";

export type PvpShopTitle = {
  titleId: TitleId;
  price: number;
};

export const PVP_SHOP_TITLES: readonly PvpShopTitle[] = [
  { titleId: "pvp_gladiator", price: 200 },
  { titleId: "pvp_veteran", price: 600 },
  { titleId: "pvp_overlord", price: 1200 },
  { titleId: "pvp_legend", price: 2500 },
];

/** 카탈로그에 등재된 titleId → 가격. 미등재면 undefined(구매 불가). */
export function pvpShopPriceFor(titleId: string): number | undefined {
  return PVP_SHOP_TITLES.find((t) => t.titleId === titleId)?.price;
}

/** 상점 노출용 — 이름·설명·가격 합본. TITLES 에 정의 없으면 제외(방어). */
export function pvpShopEntries(): {
  titleId: string;
  name: string;
  description: string;
  price: number;
}[] {
  return PVP_SHOP_TITLES.filter((t) => TITLES[t.titleId]).map((t) => ({
    titleId: t.titleId,
    name: TITLES[t.titleId].name,
    description: TITLES[t.titleId].description,
    price: t.price,
  }));
}
