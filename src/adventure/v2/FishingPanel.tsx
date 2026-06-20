"use client";

import { FishingView } from "./FishingView";
import { useFishing } from "./useFishing";

// 낚시터 패널 — 실 API 핸들러(useFishing)를 FishingView 에 주입. V2GameFlow 마을 탭에서 마운트.
export function FishingPanel({
  onBack,
  onOpenLeaderboard,
  onOpenShop,
  onOpenChallenges,
}: {
  onBack: () => void;
  onOpenLeaderboard: () => void;
  onOpenShop: () => void;
  onOpenChallenges: () => void;
}) {
  const handlers = useFishing();
  return (
    <FishingView
      {...handlers}
      onBack={onBack}
      onOpenLeaderboard={onOpenLeaderboard}
      onOpenShop={onOpenShop}
      onOpenChallenges={onOpenChallenges}
    />
  );
}
