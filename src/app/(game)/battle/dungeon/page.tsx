"use client";

import { useRouter } from "next/navigation";
import { useGameState } from "@/adventure/v2/GameStateProvider";
import { V2DungeonList } from "@/adventure/v2/V2DungeonList";

// /battle/dungeon — 무한 프론티어 사냥터 목록.
export default function DungeonListPage() {
  const router = useRouter();
  const { currentOutpost, frontierDepth } = useGameState();
  return (
    <V2DungeonList
      currentOutpost={currentOutpost}
      onSelectFloor={(depth) => router.push(`/battle/dungeon/${depth}`)}
      onOpenMap={() => router.push("/map")}
      frontierDepth={frontierDepth}
      onSelectBoss={(depth) => router.push(`/battle/dungeon/${depth}?boss=1`)}
    />
  );
}
