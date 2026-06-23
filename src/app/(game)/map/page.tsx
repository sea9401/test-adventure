"use client";

import { useRouter } from "next/navigation";
import { useGameState } from "@/adventure/v2/GameStateProvider";
import { TileMap } from "@/adventure/v2/TileMap";

// /map — 9×9 타일 보드(이동·개척 정착지 전용). 마을 탭으로 묶인다.
// 거점 화면 진입(둘러보기)은 모험 홈/길드 관리로 이관 — 여긴 항법만.
// (옛 ContinentMap 은퇴 — V2_FREEFORM_TILES 영구 ON 이라 새 보드만 렌더.)
export default function MapPage() {
  const router = useRouter();
  const {
    travelToTile,
    tilePos,
    tileSettlements,
    foundTile,
    promoteTile,
    demolishTile,
    occupations,
    treasuries,
    viewerUserId,
    viewerGuildId,
    currentOutpost,
  } = useGameState();
  return (
    <TileMap
      onTravelToTile={travelToTile}
      tilePos={tilePos}
      tileSettlements={tileSettlements}
      onFoundTile={foundTile}
      onPromoteTile={promoteTile}
      onDemolishTile={demolishTile}
      occupations={occupations}
      treasuries={treasuries}
      viewerUserId={viewerUserId}
      viewerGuildId={viewerGuildId}
      currentOutpostId={currentOutpost?.id ?? null}
      onOpenOutpost={(id) => router.push(`/outpost/${id}`)}
    />
  );
}
