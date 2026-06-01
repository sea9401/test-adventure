"use client";

import { FishingLeaderboardView } from "./FishingLeaderboardView";
import { useFishingLeaderboard } from "./useFishingLeaderboard";

// 주간 대회 순위 패널 — 마운트 시 리더보드 fetch(useFishingLeaderboard) 후 뷰에 주입.
export function FishingLeaderboardPanel({ onBack }: { onBack: () => void }) {
  const { data, loading, error } = useFishingLeaderboard();
  return (
    <FishingLeaderboardView
      data={data}
      loading={loading}
      error={error}
      onBack={onBack}
    />
  );
}
