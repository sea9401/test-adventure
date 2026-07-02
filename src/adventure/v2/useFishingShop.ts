"use client";

import { useCallback } from "react";
import type { FishingProgressionView } from "./fishingProgression";
import { useCoinShop, type BuyResult } from "./useCoinShop";

export type { BuyResult } from "./useCoinShop";
export type FishingShopState = {
  coins: number;
  ownedTitleIds: string[];
  staminaPotions: number;
  progression: FishingProgressionView | null;
};
export type FishingGearKind = "rod" | "lure";
export type FishingGearAction = "buy" | "equip";

function parseProgression(v: unknown): FishingProgressionView | null {
  return v && typeof v === "object" ? (v as FishingProgressionView) : null;
}

// 낚시 코인 상점 상태(코인·보유 칭호·낚시 진행) fetch + 구매 mutation. FishingShopView 에 주입.
// 칭호/소비품 구매는 useCoinShop 공용 코어, 낚시 도구(buyGear: 구매/장착)만 여기 전용.
export function useFishingShop() {
  const { state, setState, loading, error, buying, setBuying, buy, buyConsumable } =
    useCoinShop<FishingShopState>({
      endpoint: "/api/v2/fishing/shop",
      coinLabel: "낚시 코인",
      parseState: (j) => ({
        coins: typeof j.coins === "number" ? j.coins : 0,
        ownedTitleIds: Array.isArray(j.ownedTitleIds)
          ? (j.ownedTitleIds as string[])
          : [],
        staminaPotions:
          typeof j.staminaPotions === "number" ? j.staminaPotions : 0,
        progression: parseProgression(j.progression),
      }),
      applyServer: (s, j) => ({
        ...s,
        ...(typeof j.staminaPotions === "number"
          ? { staminaPotions: j.staminaPotions }
          : {}),
        ...(j.progression && typeof j.progression === "object"
          ? { progression: j.progression as FishingProgressionView }
          : {}),
      }),
    });

  const buyGear = useCallback(
    async (
      gearKind: FishingGearKind,
      gearId: string,
      action: FishingGearAction,
    ): Promise<BuyResult> => {
      const key = `${gearKind}:${gearId}`;
      setBuying(key);
      try {
        const res = await fetch("/api/v2/fishing/shop", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ gearKind, gearId, action }),
        });
        const j = await res.json().catch(() => null);
        if (res.ok && j?.ok) {
          setState((s) =>
            s
              ? {
                  ...s,
                  coins: typeof j.coins === "number" ? j.coins : s.coins,
                  progression: parseProgression(j.progression) ?? s.progression,
                }
              : s,
          );
          return { ok: true, message: "낚시 도구를 장착했다." };
        }
        if (j?.error === "insufficient_coins") {
          setState((s) =>
            s
              ? {
                  ...s,
                  coins: typeof j.coins === "number" ? j.coins : s.coins,
                  progression: parseProgression(j.progression) ?? s.progression,
                }
              : s,
          );
          return { ok: false, message: "낚시 코인이 부족하다." };
        }
        if (j?.error === "not_owned") {
          setState((s) => {
            const progression = parseProgression(j.progression);
            return s && progression ? { ...s, progression } : s;
          });
          return { ok: false, message: "아직 보유하지 않은 도구다." };
        }
        return { ok: false, message: "구매하지 못했다." };
      } catch {
        return { ok: false, message: "구매 처리 중 문제가 생겼다." };
      } finally {
        setBuying(null);
      }
    },
    [setState, setBuying],
  );

  return { state, loading, error, buying, buy, buyConsumable, buyGear };
}
