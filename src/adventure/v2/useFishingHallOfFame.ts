"use client";

import { useAsyncData } from "@/lib/useAsyncData";
import type { FishingHallOfFameData } from "./fishingLeaderboard";

// 역대 최대어 명예의 전당 — 마운트 시 한 번 fetch(읽기 전용). FishingHallOfFamePanel 이 주입.
// load/error 사다리는 useAsyncData 공용(응답 파싱·에러 문구 불변, 2026-07 이관).
export function useFishingHallOfFame(): {
  data: FishingHallOfFameData | null;
  loading: boolean;
  error: string | null;
} {
  const { data, loading, error } = useAsyncData<FishingHallOfFameData>(
    async (signal) => {
      const r = await fetch("/api/v2/fishing/hall-of-fame", { signal });
      const j = r.ok ? await r.json() : null;
      if (j?.ok) return { byFish: j.byFish };
      throw new Error("명예의 전당을 불러오지 못했다.");
    },
    [],
  );
  return { data, loading, error };
}
