"use client";

import { useRouter } from "next/navigation";
import { TreasurePanel } from "@/adventure/v2/TreasurePanel";

// /town/treasure — 발굴 감정소(발굴 + 보관함/대회 진입).
export default function TreasurePage() {
  const router = useRouter();
  return (
    <TreasurePanel
      onBack={() => router.push("/town")}
      onOpenCollection={() => router.push("/town/treasure/collection")}
      onOpenLeaderboard={() => router.push("/town/treasure/leaderboard")}
      onOpenShop={() => router.push("/town/treasure/shop")}
    />
  );
}
