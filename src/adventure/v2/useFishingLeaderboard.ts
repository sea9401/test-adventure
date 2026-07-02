"use client";

import { useAsyncData } from "@/lib/useAsyncData";
import type { FishingLeaderboardData } from "./fishingLeaderboard";

// 이번 주 낚시 리더보드 fetch. FishingLeaderboardView 에 데이터 주입용.
// load/error 사다리는 useAsyncData 공용(응답 파싱·에러 문구 불변, 2026-07 이관).
export function useFishingLeaderboard(): {
  data: FishingLeaderboardData | null;
  loading: boolean;
  error: string | null;
} {
  const { data, loading, error } = useAsyncData<FishingLeaderboardData>(
    async (signal) => {
      const r = await fetch("/api/v2/fishing/leaderboard", { signal });
      const j = r.ok ? await r.json() : null;
      if (j?.ok && j.byFish && typeof j.byFish === "object") {
        return {
          seasonId: String(j.seasonId ?? ""),
          endsAt: String(j.endsAt ?? ""),
          myCoins: typeof j.myCoins === "number" ? j.myCoins : 0,
          byFish: j.byFish,
        };
      }
      throw new Error("리더보드를 불러오지 못했다.");
    },
    [],
  );
  return { data, loading, error };
}
