"use client";

import { useRouter } from "next/navigation";
import { TreasureLeaderboardPanel } from "@/adventure/v2/TreasureLeaderboardPanel";

// /town/treasure/leaderboard — 발굴 주간 순위.
export default function TreasureLeaderboardPage() {
  const router = useRouter();
  return (
    <TreasureLeaderboardPanel onBack={() => router.push("/town/treasure")} />
  );
}
