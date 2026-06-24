// 발굴 코인 상점 카탈로그 — 발굴 코인(treasure-wallet.v1)으로 구매. 코인 공급원은 주간 정산.
// 주력은 코스메틱(칭호). 영구 파워템은 두지 않는다(파워 경제 밖 원칙). 단 소비템(스태미나
// 회복약)은 예외로 취급 — 명예상점/비밀상점 선례와 동일한 보관형 소비템(stamina-potions.v1).
// 서버(구매 검증)와 클라(상점 UI)가 같은 표를 본다.
//
// 새 칭호 추가 시: titles.ts 에 칭호 정의(category "treasure") + 여기 { titleId, price } 한 줄.
// 새 소비템 추가 시: TREASURE_SHOP_CONSUMABLES 에 한 줄 + 서버 라우트에 지급 분기.

import { TITLES, type TitleId } from "@/adventure/data/titles";
import { STAMINA_POTION_RESTORE } from "@/adventure/v2/staminaPotions";

export type TreasureShopTitle = {
  titleId: TitleId;
  price: number;
};

export const TREASURE_SHOP_TITLES: readonly TreasureShopTitle[] = [
  { titleId: "treasure_digger", price: 60 },
  { titleId: "treasure_curator", price: 250 },
  { titleId: "treasure_relic", price: 700 },
  { titleId: "treasure_legend", price: 2000 },
];

// 소비템 — 칭호와 달리 반복 구매(보유 상태 없음). itemId 는 서버 지급 분기 키.
export type TreasureShopConsumable = {
  itemId: string;
  name: string;
  description: string;
  price: number;
};

export const TREASURE_SHOP_CONSUMABLES: readonly TreasureShopConsumable[] = [
  {
    itemId: "stamina_potion",
    name: "스태미나 회복약",
    description: `사용 시 스태미나 ${STAMINA_POTION_RESTORE} 회복. 보관했다 필요할 때 쓴다.`,
    price: 200,
  },
];

/** 소비템 카탈로그에 등재된 itemId → 가격. 미등재면 undefined(구매 불가). */
export function treasureShopConsumablePriceFor(itemId: string): number | undefined {
  return TREASURE_SHOP_CONSUMABLES.find((c) => c.itemId === itemId)?.price;
}

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
