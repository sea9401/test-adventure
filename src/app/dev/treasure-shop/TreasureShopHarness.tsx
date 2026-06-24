"use client";

import { useCallback, useState } from "react";
import { TreasureShopView } from "@/adventure/v2/TreasureShopView";
import {
  treasureShopEntries,
  treasureShopConsumablePriceFor,
} from "@/adventure/v2/treasureShop";
import type {
  BuyResult,
  TreasureShopState,
} from "@/adventure/v2/useTreasureShop";

// /dev/treasure-shop 하니스 — 발굴 코인 상점 QA 용 mock(서버 없이). 코인 500 으로 시작.
// 구매는 뷰가 진행 중 모든 버튼을 비활성화해 직렬화 → closure state 읽기 안전.
export function TreasureShopHarness() {
  const [state, setState] = useState<TreasureShopState>({
    coins: 500,
    ownedTitleIds: [],
    staminaPotions: 0,
  });
  const [buying, setBuying] = useState<string | null>(null);

  const buy = useCallback(
    async (titleId: string): Promise<BuyResult> => {
      setBuying(titleId);
      try {
        const entry = treasureShopEntries().find((e) => e.titleId === titleId);
        if (!entry) return { ok: false, message: "없는 칭호다." };
        if (state.ownedTitleIds.includes(titleId)) {
          return { ok: false, message: "이미 보유한 칭호다." };
        }
        if (state.coins < entry.price) {
          return { ok: false, message: "발굴 코인이 부족하다." };
        }
        setState((s) => ({
          ...s,
          coins: s.coins - entry.price,
          ownedTitleIds: [...s.ownedTitleIds, titleId],
        }));
        return { ok: true, message: "칭호를 손에 넣었다." };
      } finally {
        setBuying(null);
      }
    },
    [state],
  );

  const buyConsumable = useCallback(
    async (itemId: string): Promise<BuyResult> => {
      setBuying(itemId);
      try {
        const price = treasureShopConsumablePriceFor(itemId);
        if (price === undefined) return { ok: false, message: "없는 품목이다." };
        if (state.coins < price) {
          return { ok: false, message: "발굴 코인이 부족하다." };
        }
        setState((s) => ({
          ...s,
          coins: s.coins - price,
          staminaPotions: s.staminaPotions + 1,
        }));
        return { ok: true, message: "스태미나 회복약을 구매했다." };
      } finally {
        setBuying(null);
      }
    },
    [state],
  );

  return (
    <div className="space-y-3">
      <div className="mx-auto max-w-[560px] px-6 pt-4">
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          DEV 하니스 — 서버 없이 로컬 mock. 발굴 코인 500 으로 시작, 새로고침 시 초기화.
        </div>
      </div>
      <TreasureShopView
        state={state}
        loading={false}
        error={null}
        buying={buying}
        onBuy={buy}
        onBuyConsumable={buyConsumable}
      />
    </div>
  );
}
