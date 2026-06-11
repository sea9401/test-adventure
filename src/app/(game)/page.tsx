"use client";

import { useGameState } from "@/adventure/v2/GameStateProvider";
import { V2AdventureHome } from "@/adventure/v2/V2AdventureHome";

// / — 모험 탭 home. 캐릭 카드 + 현 위치 거점 카드(진입 버튼).
export default function AdventurePage() {
  const { currentOutpost, enterOutpost } = useGameState();
  return (
    <V2AdventureHome
      currentOutpost={currentOutpost}
      onEnterOutpost={(o) => enterOutpost(o, { from: "adventure" })}
    />
  );
}
