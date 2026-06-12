"use client";

import { TreasureLeaderboardView } from "./TreasureLeaderboardView";
import { useTreasureLeaderboard } from "./useTreasureLeaderboard";

// 주간 발굴가치 순위 패널 — 마운트 시 리더보드 fetch 후 뷰에 주입.
export function TreasureLeaderboardPanel({
  onBack,
  onOpenDig,
  onOpenCollection,
}: {
  onBack: () => void;
  onOpenDig?: () => void;
  onOpenCollection?: () => void;
}) {
  const { data, loading, error } = useTreasureLeaderboard();
  return (
    <TreasureLeaderboardView
      onOpenDig={onOpenDig}
      onOpenCollection={onOpenCollection}
      data={data}
      loading={loading}
      error={error}
      onBack={onBack}
    />
  );
}
