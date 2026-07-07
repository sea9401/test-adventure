"use client";

import { useRouter } from "next/navigation";
import { TreasureDisabledPanel } from "@/adventure/v2/TreasureDisabledPanel";

// /town/treasure/leaderboard — 발굴 주간 순위.
export default function TreasureLeaderboardPage() {
  const router = useRouter();
  return <TreasureDisabledPanel onBack={() => router.push("/town")} />;
}
