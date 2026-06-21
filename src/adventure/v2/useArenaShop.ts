"use client";

import { useCallback, useEffect, useState } from "react";

export type ArenaShopState = { coins: number; ownedTitleIds: string[] };
export type BuyResult = { ok: boolean; message: string };

// 투기장 코인 상점 상태(코인·보유 칭호) fetch + 구매 mutation. ArenaShopView 에 주입.
// (낚시 코인 상점 useFishingShop 미러.)
export function useArenaShop() {
  const [state, setState] = useState<ArenaShopState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [buying, setBuying] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/v2/arena/shop")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive) return;
        if (j?.ok) {
          setState({
            coins: typeof j.coins === "number" ? j.coins : 0,
            ownedTitleIds: Array.isArray(j.ownedTitleIds) ? j.ownedTitleIds : [],
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
      const res = await fetch("/api/v2/arena/shop", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ titleId }),
      });
      const j = await res.json().catch(() => null);
      if (res.ok && j?.ok) {
        setState((s) =>
          s
            ? {
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
        return { ok: false, message: "투기장 코인이 부족하다." };
      }
      if (j?.error === "already_owned") {
        setState((s) =>
          s
            ? {
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

  return { state, loading, error, buying, buy };
}
