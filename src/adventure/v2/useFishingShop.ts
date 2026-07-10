"use client";

import { useCallback, useEffect, useState } from "react";
import type { FarmSeedInventory } from "@/adventure/v2/farm";
import { FISHING_SEED_POUCH_ITEM_ID } from "./fishingShop";

export type FishingShopState = {
  coins: number;
  ownedTitleIds: string[];
  staminaPotions: number;
  farmSeeds: FarmSeedInventory;
  seedPouch: {
    boughtToday: number;
    dailyLimit: number;
    nextPrice: number | null;
    contents: FarmSeedInventory;
  };
};
export type BuyResult = { ok: boolean; message: string };

function parseSeeds(raw: unknown): FarmSeedInventory {
  if (!raw || typeof raw !== "object") return {};
  const out: FarmSeedInventory = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (key === "wheat" || key === "herb" || key === "corn") {
      const n = Math.floor(Number(value));
      if (Number.isFinite(n) && n > 0) out[key] = n;
    }
  }
  return out;
}

function parseSeedPouch(raw: unknown): FishingShopState["seedPouch"] {
  const obj =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const boughtToday = Math.max(0, Math.floor(Number(obj.boughtToday) || 0));
  const dailyLimit = Math.max(0, Math.floor(Number(obj.dailyLimit) || 0));
  const nextPrice =
    typeof obj.nextPrice === "number" && Number.isFinite(obj.nextPrice)
      ? Math.max(0, Math.floor(obj.nextPrice))
      : null;
  return {
    boughtToday,
    dailyLimit,
    nextPrice,
    contents: parseSeeds(obj.contents),
  };
}

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
            farmSeeds: parseSeeds(j.farmSeeds),
            seedPouch: parseSeedPouch(j.seedPouch),
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
                  farmSeeds: j.farmSeeds ? parseSeeds(j.farmSeeds) : s.farmSeeds,
                  seedPouch: j.seedPouch
                    ? parseSeedPouch(j.seedPouch)
                    : s.seedPouch,
                }
              : s,
          );
          return {
            ok: true,
            message:
              itemId === FISHING_SEED_POUCH_ITEM_ID
                ? "씨앗주머니를 구매했다."
                : "스태미나 회복약을 구매했다.",
          };
        }
        if (j?.error === "insufficient_coins") {
          if (typeof j.coins === "number") {
            setState((s) =>
              s
                ? {
                    ...s,
                    coins: j.coins,
                    seedPouch: j.seedPouch
                      ? parseSeedPouch(j.seedPouch)
                      : s.seedPouch,
                  }
                : s,
            );
          }
          return { ok: false, message: "낚시 코인이 부족하다." };
        }
        if (j?.error === "limit_reached") {
          setState((s) =>
            s && j.seedPouch
              ? { ...s, seedPouch: parseSeedPouch(j.seedPouch) }
              : s,
          );
          return { ok: false, message: "오늘 구매 한도에 도달했다." };
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

  return { state, loading, error, buying, buy, buyConsumable };
}
