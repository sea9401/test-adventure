"use client";

import { useCallback, useEffect, useState } from "react";
import type { FishingProgressionView } from "./fishingProgression";

export type FishingShopState = {
  coins: number;
  ownedTitleIds: string[];
  staminaPotions: number;
  progression: FishingProgressionView | null;
};
export type BuyResult = { ok: boolean; message: string };
export type FishingGearKind = "rod" | "lure";
export type FishingGearAction = "buy" | "equip";

// 낚시 코인 상점 상태(코인·보유 칭호) fetch + 구매 mutation. FishingShopView 에 주입.
export function useFishingShop() {
  const [state, setState] = useState<FishingShopState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [buying, setBuying] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/v2/fishing/shop")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive) return;
        if (j?.ok) {
          setState({
            coins: typeof j.coins === "number" ? j.coins : 0,
            ownedTitleIds: Array.isArray(j.ownedTitleIds) ? j.ownedTitleIds : [],
            staminaPotions:
              typeof j.staminaPotions === "number" ? j.staminaPotions : 0,
            progression:
              j.progression && typeof j.progression === "object"
                ? (j.progression as FishingProgressionView)
                : null,
          });
        } else {
          setError("상점을 불러오지 못했다.");
        }
        setLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setError("상점을 불러오지 못했다.");
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const buy = useCallback(async (titleId: string): Promise<BuyResult> => {
    setBuying(titleId);
    try {
      const res = await fetch("/api/v2/fishing/shop", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ titleId }),
      });
      const j = await res.json().catch(() => null);
      if (res.ok && j?.ok) {
        setState((s) =>
          s
            ? {
                ...s,
                coins: typeof j.coins === "number" ? j.coins : s.coins,
                ownedTitleIds: [...new Set([...s.ownedTitleIds, titleId])],
              }
            : s,
        );
        return { ok: true, message: "칭호를 손에 넣었다." };
      }
      if (j?.error === "insufficient_coins") {
        if (typeof j.coins === "number") {
          setState((s) => (s ? { ...s, coins: j.coins } : s));
        }
        return { ok: false, message: "낚시 코인이 부족하다." };
      }
      if (j?.error === "already_owned") {
        setState((s) =>
          s
            ? {
                ...s,
                coins: typeof j.coins === "number" ? j.coins : s.coins,
                ownedTitleIds: [...new Set([...s.ownedTitleIds, titleId])],
              }
            : s,
        );
        return { ok: false, message: "이미 보유한 칭호다." };
      }
      return { ok: false, message: "구매하지 못했다." };
    } catch {
      return { ok: false, message: "구매 처리 중 문제가 생겼다." };
    } finally {
      setBuying(null);
    }
  }, []);

  const buyConsumable = useCallback(
    async (itemId: string): Promise<BuyResult> => {
      setBuying(itemId);
      try {
        const res = await fetch("/api/v2/fishing/shop", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ itemId }),
        });
        const j = await res.json().catch(() => null);
        if (res.ok && j?.ok) {
          setState((s) =>
            s
              ? {
                  ...s,
                  coins: typeof j.coins === "number" ? j.coins : s.coins,
                  staminaPotions:
                    typeof j.staminaPotions === "number"
                      ? j.staminaPotions
                      : s.staminaPotions,
                }
              : s,
          );
          return { ok: true, message: "스태미나 회복약을 구매했다." };
        }
        if (j?.error === "insufficient_coins") {
          if (typeof j.coins === "number") {
            setState((s) => (s ? { ...s, coins: j.coins } : s));
          }
          return { ok: false, message: "낚시 코인이 부족하다." };
        }
        return { ok: false, message: "구매하지 못했다." };
      } catch {
        return { ok: false, message: "구매 처리 중 문제가 생겼다." };
      } finally {
        setBuying(null);
      }
    },
    [],
  );

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
                  progression:
                    j.progression && typeof j.progression === "object"
                      ? (j.progression as FishingProgressionView)
                      : s.progression,
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
                  progression:
                    j.progression && typeof j.progression === "object"
                      ? (j.progression as FishingProgressionView)
                      : s.progression,
                }
              : s,
          );
          return { ok: false, message: "낚시 코인이 부족하다." };
        }
        if (j?.error === "not_owned") {
          setState((s) =>
            s && j.progression && typeof j.progression === "object"
              ? { ...s, progression: j.progression as FishingProgressionView }
              : s,
          );
          return { ok: false, message: "아직 보유하지 않은 도구다." };
        }
        return { ok: false, message: "구매하지 못했다." };
      } catch {
        return { ok: false, message: "구매 처리 중 문제가 생겼다." };
      } finally {
        setBuying(null);
      }
    },
    [],
  );

  return { state, loading, error, buying, buy, buyConsumable, buyGear };
}
