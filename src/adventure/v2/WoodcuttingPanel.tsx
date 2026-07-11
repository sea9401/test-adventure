"use client";

import { WoodcuttingView } from "./WoodcuttingView";
import { useWoodcutting } from "./useWoodcutting";
import type { WoodcuttingSpotId } from "@/adventure/data/v2/woodcuttingSpots";

export function WoodcuttingPanel({
  onBack,
  spotId,
}: {
  onBack: () => void;
  spotId: WoodcuttingSpotId;
}) {
  const handlers = useWoodcutting();
  return (
    <WoodcuttingView
      {...handlers}
      onBack={onBack}
      spotId={spotId}
    />
  );
}
