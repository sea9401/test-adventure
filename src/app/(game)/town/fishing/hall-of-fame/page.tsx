"use client";

import { useRouter } from "next/navigation";
import { FishingHallOfFamePanel } from "@/adventure/v2/FishingHallOfFamePanel";

// /town/fishing/hall-of-fame — 역대 최대어 명예의 전당.
export default function FishingHallOfFamePage() {
  const router = useRouter();
  return (
    <FishingHallOfFamePanel
      onBack={() => router.push("/town/fishing")}
      onOpenFishing={() => router.push("/town/fishing")}
      onOpenChallenges={() => router.push("/town/fishing/challenges")}
      onOpenLeaderboard={() => router.push("/town/fishing/leaderboard")}
      onOpenShop={() => router.push("/town/fishing/shop")}
    />
  );
}
