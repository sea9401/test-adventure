"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FishingPanel } from "@/adventure/v2/FishingPanel";
import {
  DEFAULT_FISHING_SPOT_ID,
  isFishingSpotId,
  type FishingSpotId,
} from "@/adventure/data/v2/fishingSpots";

const LAST_FISHING_SPOT_STORAGE_KEY = "v2.lastFishingSpotId";

// /town/fishing — 낚시터(미니게임 + 대회/상점 진입).
export default function FishingPage() {
  const router = useRouter();
  const params = useSearchParams();
  const spotParam = params.get("spot");
  const querySpotId = isFishingSpotId(spotParam ?? "")
    ? (spotParam as FishingSpotId)
    : null;
  const spotId: FishingSpotId = querySpotId ?? DEFAULT_FISHING_SPOT_ID;

  useEffect(() => {
    if (querySpotId) {
      window.localStorage.setItem(LAST_FISHING_SPOT_STORAGE_KEY, querySpotId);
      return;
    }
    const saved = window.localStorage.getItem(LAST_FISHING_SPOT_STORAGE_KEY);
    if (saved && isFishingSpotId(saved)) {
      router.replace(`/town/fishing?spot=${saved}`);
    }
  }, [querySpotId, router]);

  return (
    <FishingPanel
      spotId={spotId}
      onBack={() => router.push("/town")}
      onOpenLeaderboard={() => router.push("/town/fishing/leaderboard")}
      onOpenShop={() => router.push("/town/fishing/shop")}
      onOpenChallenges={() => router.push("/town/fishing/challenges")}
      onOpenHallOfFame={() => router.push("/town/fishing/hall-of-fame")}
      onOpenCoopSession={(sessionId) => router.push(`/battle/coop/${sessionId}`)}
    />
  );
}
