// 발굴 코인 상점 카탈로그 — 발굴 코인(treasure-wallet.v1)으로 구매. 전부 코스메틱(칭호).
// 감정사 분해로 모은 코인의 소비처. 영구 파워템은 두지 않는다(파워 경제 밖 원칙).
// 서버(구매 검증)와 클라(상점 UI)가 같은 표를 본다.
//
// 새 품목 추가 시: titles.ts 에 칭호 정의(category "treasure") + 여기 { titleId, price } 한 줄.
// 가격은 분해 코인 규모(흔함 1·전설 50/점) 기준 초안 — 후속 튜닝 다이얼.

import { TITLES, type TitleId } from "@/adventure/data/titles";

export type TreasureShopTitle = {
  titleId: TitleId;
  price: number;
};

export const TREASURE_SHOP_TITLES: readonly TreasureShopTitle[] = [
  { titleId: "treasure_digger", price: 60 },
  { titleId: "treasure_curator", price: 250 },
  { titleId: "treasure_relic", price: 700 },
  { titleId: "treasure_legend", price: 1800 },
];

/** 카탈로그에 등재된 titleId → 가격. 미등재면 undefined(구매 불가). */
export function treasureShopPriceFor(titleId: string): number | undefined {
  return TREASURE_SHOP_TITLES.find((t) => t.titleId === titleId)?.price;
}

/** 상점 노출용 — 이름·설명·가격 합본. titles.ts 에 정의 없으면 제외(방어). */
export function treasureShopEntries(): {
  titleId: string;
  name: string;
  description: string;
  price: number;
}[] {
  return TREASURE_SHOP_TITLES.filter((t) => TITLES[t.titleId]).map((t) => ({
    titleId: t.titleId,
    name: TITLES[t.titleId].name,
    description: TITLES[t.titleId].description,
    price: t.price,
  }));
}
