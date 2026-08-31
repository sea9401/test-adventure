"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FishingShopPanel } from "@/adventure/v2/FishingShopPanel";

// /town/fishing/shop — 낚시 코인 상점.
export default function FishingShopPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-sm text-zinc-500">
          상점을 불러오는 중…
        </div>
      }
    >
      <FishingShopPageContent />
    </Suspense>
  );
}

function FishingShopPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  return (
    <FishingShopPanel
      onBack={() => router.push("/town")}
      onOpenFishing={() => router.push("/town/fishing")}
      onOpenDangerous={() => router.push("/town/fishing/dangerous")}
      onOpenChallenges={() => router.push("/town/fishing/challenges")}
      onOpenLeaderboard={() => router.push("/town/fishing/leaderboard")}
      onOpenHallOfFame={() => router.push("/town/fishing/hall-of-fame")}
      initialTab={
        searchParams.get("tab") === "dangerous" ? "dangerous" : "regular"
      }
    />
  );
}
