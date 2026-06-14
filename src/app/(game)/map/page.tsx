"use client";

import { useGameState } from "@/adventure/v2/GameStateProvider";
import { ContinentMap } from "@/adventure/v2/ContinentMap";

// /map — 대륙 지도(이동 전용). 마을 탭으로 묶인다.
// 거점 화면 진입(둘러보기)은 전쟁 작전지도/모험 홈/길드 관리로 이관 — 여긴 항법만.
export default function MapPage() {
  const {
    travelTo,
    warpTo,
    occupations,
    treasuries,
    viewerUserId,
    currentOutpost,
    discoveredIds,
  } = useGameState();
  return (
    <ContinentMap
      onTravelTo={travelTo}
      onWarp={(o) => warpTo(o.id)}
      occupations={occupations}
      treasuries={treasuries}
      viewerUserId={viewerUserId}
      currentOutpostId={currentOutpost?.id ?? null}
      discoveredIds={discoveredIds}
    />
  );
}
