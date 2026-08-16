"use client";

import { useRouter } from "next/navigation";
import { DangerousFishingView } from "@/adventure/v2/DangerousFishingView";
import { useDangerousFishing } from "@/adventure/v2/useDangerousFishing";

export default function DangerousFishingPage() {
  const router = useRouter();
  const fishing = useDangerousFishing();
  return (
    <DangerousFishingView
      model={fishing.model}
      boss={fishing.boss}
      loading={fishing.loading}
      busy={fishing.busy}
      error={fishing.error}
      verification={fishing.verification}
      verifyHuman={fishing.verifyHuman}
      onBack={() => router.push("/map")}
      onOpenFishing={() => router.push("/town/fishing")}
      onOpenChallenges={() => router.push("/town/fishing/challenges")}
      onOpenLeaderboard={() => router.push("/town/fishing/leaderboard")}
      onOpenHallOfFame={() => router.push("/town/fishing/hall-of-fame")}
      onOpenShop={() => router.push("/town/fishing/shop?tab=dangerous")}
      onStartVoyage={fishing.startVoyage}
      onReturnVoyage={fishing.returnVoyage}
      onStartEncounter={fishing.startEncounter}
      onAction={fishing.act}
      onStartBossAttempt={fishing.startBossAttempt}
      onBossAction={fishing.actOnBoss}
      onClaimBossReward={fishing.claimBossReward}
    />
  );
}
