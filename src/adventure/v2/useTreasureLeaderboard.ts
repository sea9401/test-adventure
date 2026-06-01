"use client";

import { useEffect, useState } from "react";
import type {
  TreasureLeaderboardData,
  TreasureLeaderboardEntry,
} from "./treasureLeaderboard";

// 이번 주 발굴가치 리더보드 fetch. TreasureLeaderboardView 에 데이터 주입용.
export function useTreasureLeaderboard(): {
  data: TreasureLeaderboardData | null;
  loading: boolean;
  error: string | null;
} {
  const [data, setData] = useState<TreasureLeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/v2/treasure/leaderboard")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive) return;
        if (j?.ok && Array.isArray(j.entries)) {
          setData({
            seasonId: String(j.seasonId ?? ""),
            endsAt: String(j.endsAt ?? ""),
            myCoins: typeof j.myCoins === "number" ? j.myCoins : 0,
            entries: j.entries as TreasureLeaderboardEntry[],
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
