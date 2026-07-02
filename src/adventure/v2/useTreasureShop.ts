"use client";

import { useCoinShop } from "./useCoinShop";

export type { BuyResult } from "./useCoinShop";
export type TreasureShopState = {
  coins: number;
  ownedTitleIds: string[];
  staminaPotions: number;
};

// 발굴 코인 상점 상태(코인·보유 칭호) fetch + 구매 mutation. TreasureShopView 에 주입.
// 구현은 useCoinShop 공용 코어 — 여기는 엔드포인트·라벨·스태미나 포션 필드만 정의.
export function useTreasureShop() {
  const { state, loading, error, buying, buy, buyConsumable } =
    useCoinShop<TreasureShopState>({
      endpoint: "/api/v2/treasure/shop",
      coinLabel: "발굴 코인",
      parseState: (j) => ({
        coins: typeof j.coins === "number" ? j.coins : 0,
        ownedTitleIds: Array.isArray(j.ownedTitleIds)
          ? (j.ownedTitleIds as string[])
          : [],
        staminaPotions:
          typeof j.staminaPotions === "number" ? j.staminaPotions : 0,
      }),
      applyServer: (s, j) =>
        typeof j.staminaPotions === "number"
          ? { ...s, staminaPotions: j.staminaPotions }
          : s,
    });
  return { state, loading, error, buying, buy, buyConsumable };
}
