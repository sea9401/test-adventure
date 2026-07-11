"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { WoodcuttingPanel } from "@/adventure/v2/WoodcuttingPanel";
import {
  DEFAULT_WOODCUTTING_SPOT_ID,
  isWoodcuttingSpotId,
  type WoodcuttingSpotId,
} from "@/adventure/data/v2/woodcuttingSpots";

export default function LoggingPage() {
  const router = useRouter();
  const params = useSearchParams();
  const spotParam = params.get("spot");
  const spotId: WoodcuttingSpotId = isWoodcuttingSpotId(spotParam ?? "")
    ? (spotParam as WoodcuttingSpotId)
    : DEFAULT_WOODCUTTING_SPOT_ID;

  return (
    <WoodcuttingPanel
      key={spotId}
      spotId={spotId}
      onSpotChange={(nextSpotId) => router.replace(`/town/logging?spot=${nextSpotId}`)}
      onBack={() => router.push("/town")}
    />
  );
}
