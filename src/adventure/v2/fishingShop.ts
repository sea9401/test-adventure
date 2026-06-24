// 낚시 코인 상점 카탈로그 — 낚시 코인(fishing-wallet.v1)으로 구매. 전부 코스메틱(칭호) —
// 주간 정산 보상 화폐의 소비처. 영구 파워템은 두지 않는다(보조적 사이드 컨텐츠 취지).
// 서버(구매 검증)와 클라(상점 UI)가 같은 표를 본다.
//
// 새 품목 추가 시: titles.ts 에 칭호 정의(category "fishing") + 여기 { titleId, price } 한 줄.
// 가격은 주간 정산 코인 규모(캐주얼 ~수십/주, 상위 ~수백/주) 기준 초안 — 후속 튜닝 다이얼.
// 2026-06-25 칭호 과다 정리: 4종(심해의 어부·여명의 낚시꾼·물때를 읽는 자·특별한 손님의 벗)
//   제거 — titles.ts 정의까지 삭제(표시 경로 미정의 id 가드·옛 보유분은 비표시·데이터 무손실).
//   활성 3종만 등재.

import { TITLES, type TitleId } from "@/adventure/data/titles";

export type FishingShopTitle = {
  titleId: TitleId;
  price: number;
};

export const FISHING_SHOP_TITLES: readonly FishingShopTitle[] = [
  { titleId: "fishing_trophy", price: 600 }, // 월척 사냥꾼
  { titleId: "fishing_legend", price: 1500 }, // 바다의 전설
  { titleId: "fishing_taegong", price: 3000 }, // 강태공
];

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
