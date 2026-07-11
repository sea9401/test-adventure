"use client";

import { WoodcuttingView } from "./WoodcuttingView";
import { useWoodcutting } from "./useWoodcutting";
import {
  DEFAULT_WOODCUTTING_SPOT_ID,
  type WoodcuttingSpotId,
} from "@/adventure/data/v2/woodcuttingSpots";

export function WoodcuttingPanel({
  onBack,
  spotId = DEFAULT_WOODCUTTING_SPOT_ID,
  onSpotChange,
}: {
  onBack: () => void;
  spotId?: WoodcuttingSpotId;
  onSpotChange?: (spotId: WoodcuttingSpotId) => void;
}) {
  const handlers = useWoodcutting();
  return (
    <WoodcuttingView
      {...handlers}
      onBack={onBack}
      initialSpotId={spotId}
      onSpotChange={onSpotChange}
    />
  );
}
