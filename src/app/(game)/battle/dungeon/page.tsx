"use client";

import { useRouter } from "next/navigation";
import { useGameState } from "@/adventure/v2/GameStateProvider";
import { V2DungeonList } from "@/adventure/v2/V2DungeonList";

// /battle/dungeon — 현재 거점의 사냥터 층 목록.
export default function DungeonListPage() {
  const router = useRouter();
  const { currentOutpost } = useGameState();
  return (
    <V2DungeonList
      currentOutpost={currentOutpost}
      onSelectFloor={(floorId) => router.push(`/battle/dungeon/${floorId}`)}
      onOpenMap={() => router.push("/map")}
    />
  );
}
