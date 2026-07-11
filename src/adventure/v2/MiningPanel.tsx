"use client";

import { MiningView } from "./MiningView";
import { useMining } from "./useMining";
import type { MiningSpotId } from "@/adventure/data/v2/miningSpots";

export function MiningPanel({
  onBack,
  spotId,
}: {
  onBack: () => void;
  spotId: MiningSpotId;
}) {
  const handlers = useMining();
  return <MiningView {...handlers} onBack={onBack} spotId={spotId} />;
}
