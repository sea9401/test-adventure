"use client";

import { useGameState } from "@/adventure/v2/GameStateProvider";
import { ContinentMap } from "@/adventure/v2/ContinentMap";

// /map — 대륙 지도(거점 진입/이동). 전투 탭으로 묶인다.
export default function MapPage() {
  const {
    enterOutpost,
    travelTo,
    occupations,
    viewerUserId,
    currentOutpost,
    discoveredIds,
  } = useGameState();
  return (
    <ContinentMap
      onOutpostEnter={enterOutpost}
      onTravelTo={travelTo}
      occupations={occupations}
      viewerUserId={viewerUserId}
      currentOutpostId={currentOutpost?.id ?? null}
      discoveredIds={discoveredIds}
    />
  );
}
