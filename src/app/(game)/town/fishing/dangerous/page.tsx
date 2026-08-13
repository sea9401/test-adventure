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
      onBack={() => router.push("/map")}
      onOpenFishing={() => router.push("/town/fishing")}
      onStartVoyage={fishing.startVoyage}
      onReturnVoyage={fishing.returnVoyage}
      onStartEncounter={fishing.startEncounter}
      onAction={fishing.act}
      onShop={fishing.shop}
      onStartBossAttempt={fishing.startBossAttempt}
      onBossAction={fishing.actOnBoss}
      onClaimBossReward={fishing.claimBossReward}
    />
  );
}
