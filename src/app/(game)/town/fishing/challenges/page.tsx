"use client";

import { useRouter } from "next/navigation";
import { FishingDailyChallengePanel } from "@/adventure/v2/FishingDailyChallengePanel";

// /town/fishing/challenges — 오늘의 낚시 도전(일일 코인 보상).
export default function FishingChallengesPage() {
  const router = useRouter();
  return (
    <FishingDailyChallengePanel
      onBack={() => router.push("/town")}
      onOpenFishing={() => router.push("/town/fishing")}
      onOpenLeaderboard={() => router.push("/town/fishing/leaderboard")}
      onOpenHallOfFame={() => router.push("/town/fishing/hall-of-fame")}
      onOpenShop={() => router.push("/town/fishing/shop")}
    />
  );
}
