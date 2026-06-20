"use client";

import { useRouter } from "next/navigation";
import { FishingPanel } from "@/adventure/v2/FishingPanel";

// /town/fishing — 낚시터(미니게임 + 대회/상점 진입).
export default function FishingPage() {
  const router = useRouter();
  return (
    <FishingPanel
      onBack={() => router.push("/town")}
      onOpenLeaderboard={() => router.push("/town/fishing/leaderboard")}
      onOpenShop={() => router.push("/town/fishing/shop")}
      onOpenChallenges={() => router.push("/town/fishing/challenges")}
      onOpenHallOfFame={() => router.push("/town/fishing/hall-of-fame")}
    />
  );
}
