"use client";

import { useRouter } from "next/navigation";
import { FishingShopPanel } from "@/adventure/v2/FishingShopPanel";

// /town/fishing/shop — 낚시 코인 상점.
export default function FishingShopPage() {
  const router = useRouter();
  return (
    <FishingShopPanel
      onBack={() => router.push("/town/fishing")}
      onOpenFishing={() => router.push("/town/fishing")}
      onOpenChallenges={() => router.push("/town/fishing/challenges")}
      onOpenLeaderboard={() => router.push("/town/fishing/leaderboard")}
      onOpenHallOfFame={() => router.push("/town/fishing/hall-of-fame")}
    />
  );
}
