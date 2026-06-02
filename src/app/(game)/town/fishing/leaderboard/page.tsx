"use client";

import { useRouter } from "next/navigation";
import { FishingLeaderboardPanel } from "@/adventure/v2/FishingLeaderboardPanel";

// /town/fishing/leaderboard — 낚시 주간 대회 순위.
export default function FishingLeaderboardPage() {
  const router = useRouter();
  return <FishingLeaderboardPanel onBack={() => router.push("/town/fishing")} />;
}
