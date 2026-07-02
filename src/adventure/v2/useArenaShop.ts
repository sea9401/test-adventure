"use client";

import { useCoinShop } from "./useCoinShop";

export type { BuyResult } from "./useCoinShop";
export type ArenaShopState = { coins: number; ownedTitleIds: string[] };

// 투기장 코인 상점 상태(코인·보유 칭호) fetch + 구매 mutation. ArenaShopView 에 주입.
// 구현은 useCoinShop 공용 코어 — 소비품 없는 칭호 전용 상점이라 buy 만 노출.
export function useArenaShop() {
  const { state, loading, error, buying, buy } = useCoinShop<ArenaShopState>({
    endpoint: "/api/v2/arena/shop",
    coinLabel: "투기장 코인",
    parseState: (j) => ({
      coins: typeof j.coins === "number" ? j.coins : 0,
      ownedTitleIds: Array.isArray(j.ownedTitleIds)
        ? (j.ownedTitleIds as string[])
        : [],
    }),
  });
  return { state, loading, error, buying, buy };
}
