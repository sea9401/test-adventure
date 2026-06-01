"use client";

import { useEffect, useState } from "react";
import type { FishingLeaderboardData } from "./fishingLeaderboard";

// 이번 주 낚시 리더보드 fetch. FishingLeaderboardView 에 데이터 주입용.
export function useFishingLeaderboard(): {
  data: FishingLeaderboardData | null;
  loading: boolean;
  error: string | null;
} {
  const [data, setData] = useState<FishingLeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/v2/fishing/leaderboard")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive) return;
        if (j?.ok && j.byFish && typeof j.byFish === "object") {
          setData({
            seasonId: String(j.seasonId ?? ""),
            endsAt: String(j.endsAt ?? ""),
            myCoins: typeof j.myCoins === "number" ? j.myCoins : 0,
            byFish: j.byFish,
          });
        } else {
          setError("리더보드를 불러오지 못했다.");
        }
        setLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setError("리더보드를 불러오지 못했다.");
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  return { data, loading, error };
}
