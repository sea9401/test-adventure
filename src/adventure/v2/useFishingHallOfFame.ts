"use client";

import { useEffect, useRef, useState } from "react";
import type { FishingHallOfFameData } from "./fishingLeaderboard";

// 역대 최대어 명예의 전당 — 마운트 시 한 번 fetch(읽기 전용). FishingHallOfFamePanel 이 주입.
export function useFishingHallOfFame(): {
  data: FishingHallOfFameData | null;
  loading: boolean;
  error: string | null;
} {
  const [data, setData] = useState<FishingHallOfFameData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    fetch("/api/v2/fishing/hall-of-fame")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!mounted.current) return;
        if (j?.ok) setData({ byFish: j.byFish });
        else setError("명예의 전당을 불러오지 못했다.");
        setLoading(false);
      })
      .catch(() => {
        if (!mounted.current) return;
        setError("명예의 전당을 불러오지 못했다.");
        setLoading(false);
      });
    return () => {
      mounted.current = false;
    };
  }, []);

  return { data, loading, error };
}
