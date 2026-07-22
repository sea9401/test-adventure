"use client";

import { useCoinShop } from "./useCoinShop";

export type { BuyResult } from "./useCoinShop";
export type ArenaShopState = {
  coins: number;
  ownedTitleIds: string[];
  staminaPotions: number;
};

// 투기장 코인 상점 상태(코인·보유 칭호·스태미나 회복약) fetch + 구매 mutation.
// 구현은 useCoinShop 공용 코어를 사용하고 칭호/소비품 구매를 함께 노출한다.
export function useArenaShop() {
  const { state, loading, error, buying, buy, buyConsumable } =
    useCoinShop<ArenaShopState>({
      endpoint: "/api/v2/arena/shop",
      coinLabel: "투기장 코인",
      parseState: (j) => ({
        coins: typeof j.coins === "number" ? j.coins : 0,
        ownedTitleIds: Array.isArray(j.ownedTitleIds)
          ? (j.ownedTitleIds as string[])
          : [],
        staminaPotions:
          typeof j.staminaPotions === "number" ? j.staminaPotions : 0,
      }),
      applyServer: (s, j) => ({
        ...s,
        ...(typeof j.staminaPotions === "number"
          ? { staminaPotions: j.staminaPotions }
          : {}),
      }),
    });
  return { state, loading, error, buying, buy, buyConsumable };
}
