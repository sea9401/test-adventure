"use client";

import { useGameState } from "@/adventure/v2/GameStateProvider";
import { ContinentMap } from "@/adventure/v2/ContinentMap";
import { TileMap } from "@/adventure/v2/TileMap";
import { V2_FREEFORM_TILES } from "@/adventure/data/v2/coreLoopConfig";

// /map — 대륙 지도(이동 전용). 마을 탭으로 묶인다.
// 거점 화면 진입(둘러보기)은 전쟁 작전지도/모험 홈/길드 관리로 이관 — 여긴 항법만.
// V2_FREEFORM_TILES on → 새 9×9 타일 보드(TileMap). off(기본) → 옛 ContinentMap.
export default function MapPage() {
  const {
    travelTo,
    travelToTile,
    tilePos,
    occupations,
    treasuries,
    viewerUserId,
    currentOutpost,
  } = useGameState();
  if (V2_FREEFORM_TILES) {
    return (
      <TileMap
        onTravelToTile={travelToTile}
        tilePos={tilePos}
        occupations={occupations}
        treasuries={treasuries}
        viewerUserId={viewerUserId}
        currentOutpostId={currentOutpost?.id ?? null}
      />
    );
  }
  return (
    <ContinentMap
      onTravelTo={travelTo}
      occupations={occupations}
      treasuries={treasuries}
      viewerUserId={viewerUserId}
      currentOutpostId={currentOutpost?.id ?? null}
    />
  );
}
