"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useGameState } from "@/adventure/v2/GameStateProvider";
import { V2DungeonList } from "@/adventure/v2/V2DungeonList";

// /battle/dungeon — 무한 프론티어 사냥터 목록.
// 자동 사냥(오프라인 세션) 중이면 목록 대신 사냥 중인 층으로 바로 입장한다 — 거기서 정지 가능.
export default function DungeonListPage() {
  const router = useRouter();
  const { currentOutpost, frontierDepth, offlineHunt } = useGameState();

  // 자동 사냥 활성 → 사냥 중인 farm 깊이로 직행(목록 건너뜀). 정지하면 다시 목록이 보인다.
  const autoHuntDepth =
    offlineHunt?.active && offlineHunt.depth > 0 ? offlineHunt.depth : null;
  useEffect(() => {
    if (autoHuntDepth != null) {
      router.replace(`/battle/dungeon/${autoHuntDepth}`);
    }
  }, [autoHuntDepth, router]);
  if (autoHuntDepth != null) return null;

  return (
    <V2DungeonList
      currentOutpost={currentOutpost}
      onSelectFloor={(depth) => router.push(`/battle/dungeon/${depth}`)}
      onOpenMap={() => router.push("/map")}
      frontierDepth={frontierDepth}
      onSelectRareMap={(m) =>
        router.push(`/battle/dungeon/${m.depth}?rareMap=${m.iid}`)
      }
    />
  );
}
