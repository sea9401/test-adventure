// 낚시 코인 상점 카탈로그 — 낚시 코인(fishing-wallet.v1)으로 구매. 주력은 코스메틱(칭호) —
// 주간 정산 보상 화폐의 소비처. 영구 파워템은 두지 않는다(보조적 사이드 컨텐츠 취지). 단
// 소비템(스태미나 회복약)은 예외로 취급 — 발굴/명예 상점 선례와 동일한 보관형 소비템.
// 서버(구매 검증)와 클라(상점 UI)가 같은 표를 본다.
//
// 새 칭호 추가 시: titles.ts 에 칭호 정의(category "fishing") + 여기 { titleId, price } 한 줄.
// 새 소비템 추가 시: FISHING_SHOP_CONSUMABLES 에 한 줄 + 서버 라우트에 지급 분기.
// 2026-06-25 칭호 과다 정리: 4종(심해의 어부·여명의 낚시꾼·물때를 읽는 자·특별한 손님의 벗)
//   제거 — titles.ts 정의까지 삭제(표시 경로 미정의 id 가드·옛 보유분은 비표시·데이터 무손실).
//   활성 3종만 등재.

import { TITLES, type TitleId } from "@/adventure/data/titles";
import { STAMINA_POTION_RESTORE } from "@/adventure/v2/staminaPotions";

export type FishingShopTitle = {
  titleId: TitleId;
  price: number;
};

export const FISHING_SHOP_TITLES: readonly FishingShopTitle[] = [
  { titleId: "fishing_trophy", price: 600 }, // 월척 사냥꾼
  { titleId: "fishing_legend", price: 1500 }, // 바다의 전설
  { titleId: "fishing_taegong", price: 3000 }, // 강태공
];

// 소비템 — 칭호와 달리 반복 구매(보유 상태 없음). itemId 는 서버 지급 분기 키.
export type FishingShopConsumable = {
  itemId: string;
  name: string;
  description: string;
  price: number;
};

export const FISHING_SHOP_CONSUMABLES: readonly FishingShopConsumable[] = [
  {
    itemId: "stamina_potion",
    name: "스태미나 회복약",
    description: `사용 시 스태미나 ${STAMINA_POTION_RESTORE} 회복. 보관했다 필요할 때 쓴다.`,
    price: 200, // 2026-06-27 사용자 결정 100→200.
  },
];

/** 소비템 카탈로그에 등재된 itemId → 가격. 미등재면 undefined(구매 불가). */
export function fishingShopConsumablePriceFor(itemId: string): number | undefined {
  return FISHING_SHOP_CONSUMABLES.find((c) => c.itemId === itemId)?.price;
}

/** 카탈로그에 등재된 titleId → 가격. 미등재면 undefined(구매 불가). */
export function fishingShopPriceFor(titleId: string): number | undefined {
  return FISHING_SHOP_TITLES.find((t) => t.titleId === titleId)?.price;
}

/** 상점 노출용 — 이름·설명·가격 합본. titles.ts 에 정의 없으면 제외(방어). */
export function fishingShopEntries(): {
  titleId: string;
  name: string;
  description: string;
  price: number;
}[] {
  return FISHING_SHOP_TITLES.filter((t) => TITLES[t.titleId]).map((t) => ({
    titleId: t.titleId,
    name: TITLES[t.titleId].name,
    description: TITLES[t.titleId].description,
    price: t.price,
  }));
}
