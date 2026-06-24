"use client";

import { FishingDailyChallengeView } from "./FishingDailyChallengeView";
import { useFishingDailyChallenge } from "./useFishingDailyChallenge";

// 오늘의 낚시 도전 패널 — 마운트 시 진행/코인 fetch(useFishingDailyChallenge) 후 뷰에 주입.
export function FishingDailyChallengePanel({
  onBack,
  onOpenFishing,
  onOpenLeaderboard,
  onOpenHallOfFame,
  onOpenShop,
}: {
  onBack: () => void;
  onOpenFishing?: () => void;
  onOpenLeaderboard?: () => void;
  onOpenHallOfFame?: () => void;
  onOpenShop?: () => void;
}) {
  const { state, loading, error, claiming, claim } = useFishingDailyChallenge();
  return (
    <FishingDailyChallengeView
      state={state}
      loading={loading}
      error={error}
      claiming={claiming}
      onClaim={claim}
      onBack={onBack}
      onOpenFishing={onOpenFishing}
      onOpenLeaderboard={onOpenLeaderboard}
      onOpenHallOfFame={onOpenHallOfFame}
      onOpenShop={onOpenShop}
    />
  );
}
