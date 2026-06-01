"use client";

import { useState } from "react";
import { FishingShopView } from "@/adventure/v2/FishingShopView";
import { fishingShopPriceFor } from "@/adventure/v2/fishingShop";
import type { BuyResult, FishingShopState } from "@/adventure/v2/useFishingShop";

// /dev/fishing-shop — mock 코인/보유로 상점 구매 UI QA(로그인·DB 없이).
export function FishingShopHarness() {
  const [state, setState] = useState<FishingShopState>({
    coins: 800,
    ownedTitleIds: ["fishing_taegong"],
  });

  const buy = async (titleId: string): Promise<BuyResult> => {
    const price = fishingShopPriceFor(titleId);
    if (price === undefined) return { ok: false, message: "알 수 없는 칭호." };
    if (state.ownedTitleIds.includes(titleId)) {
      return { ok: false, message: "이미 보유한 칭호다." };
    }
    if (state.coins < price) return { ok: false, message: "낚시 코인이 부족하다." };
    setState((s) => ({
      coins: s.coins - price,
      ownedTitleIds: [...s.ownedTitleIds, titleId],
    }));
    return { ok: true, message: "칭호를 손에 넣었다." };
  };

  return (
    <div className="space-y-3">
      <div className="mx-auto max-w-[560px] px-6 pt-4">
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          DEV 하니스 — mock 코인 800, 강태공 보유. 구매 시 로컬 차감(새로고침 초기화).
        </div>
      </div>
      <FishingShopView
        state={state}
        loading={false}
        buying={null}
        onBuy={buy}
      />
    </div>
  );
}
