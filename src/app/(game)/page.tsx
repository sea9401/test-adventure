"use client";

import { useGameState } from "@/adventure/v2/GameStateProvider";
import { V2AdventureHome } from "@/adventure/v2/V2AdventureHome";

// / — 모험 탭 home. 캐릭 카드 + 현 위치 거점 카드(정보 표시).
export default function AdventurePage() {
  const { currentOutpost, tilePos, tileSettlements } = useGameState();
  return (
    <V2AdventureHome
      currentOutpost={currentOutpost}
      tilePos={tilePos}
      tileSettlements={tileSettlements}
    />
  );
}
