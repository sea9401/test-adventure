"use client";

import { FishingHallOfFameView } from "./FishingHallOfFameView";
import { useFishingHallOfFame } from "./useFishingHallOfFame";

// 역대 최대어 명예의 전당 패널 — 마운트 시 fetch(useFishingHallOfFame) 후 뷰에 주입.
export function FishingHallOfFamePanel({
  onBack,
  onOpenFishing,
  onOpenDangerous,
  onOpenChallenges,
  onOpenLeaderboard,
  onOpenShop,
}: {
  onBack: () => void;
  onOpenFishing?: () => void;
  onOpenDangerous?: () => void;
  onOpenChallenges?: () => void;
  onOpenLeaderboard?: () => void;
  onOpenShop?: () => void;
}) {
  const { data, loading, error } = useFishingHallOfFame();
  return (
    <FishingHallOfFameView
      data={data}
      loading={loading}
      error={error}
      onBack={onBack}
      onOpenFishing={onOpenFishing}
      onOpenDangerous={onOpenDangerous}
      onOpenChallenges={onOpenChallenges}
      onOpenLeaderboard={onOpenLeaderboard}
      onOpenShop={onOpenShop}
    />
  );
}
