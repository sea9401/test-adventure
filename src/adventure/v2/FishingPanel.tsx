"use client";

import { FishingView } from "./FishingView";
import { useGameActivityState } from "./GameStateProvider";
import { useFishing } from "./useFishing";
import {
  DEFAULT_FISHING_SPOT_ID,
  FISHING_SPOTS,
  type FishingSpotId,
} from "@/adventure/data/v2/fishingSpots";

// 낚시터 패널 — 실 API 핸들러(useFishing)를 FishingView 에 주입. V2GameFlow 마을 탭에서 마운트.
export function FishingPanel({
  onBack,
  onOpenLeaderboard,
  onOpenDangerous,
  onOpenShop,
  onOpenChallenges,
  onOpenHallOfFame,
  onOpenCoopSession,
  spotId = DEFAULT_FISHING_SPOT_ID,
}: {
  onBack: () => void;
  onOpenLeaderboard: () => void;
  onOpenDangerous: () => void;
  onOpenShop: () => void;
  onOpenChallenges: () => void;
  onOpenHallOfFame: () => void;
  onOpenCoopSession?: (sessionId: string) => void;
  spotId?: FishingSpotId;
}) {
  const handlers = useFishing(spotId);
  const { setFishingActive } = useGameActivityState();
  const spot = FISHING_SPOTS[spotId];
  return (
    <FishingView
      {...handlers}
      onFishingActiveChange={setFishingActive}
      fishingSpot={spot}
      onBack={onBack}
      onOpenLeaderboard={onOpenLeaderboard}
      onOpenDangerous={onOpenDangerous}
      onOpenShop={onOpenShop}
      onOpenChallenges={onOpenChallenges}
      onOpenHallOfFame={onOpenHallOfFame}
      onOpenCoopSession={onOpenCoopSession}
    />
  );
}
