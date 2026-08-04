"use client";

import { useRouter } from "next/navigation";
import { useGameState } from "@/adventure/v2/GameStateProvider";
import { V2SparringView } from "@/adventure/v2/V2SparringView";
import { playerCombatToBattleStats } from "@/adventure/v2/PlayerStatusCard";

// /battle/sparring — 훈련장(허수아비 모의전). 옛 마을 훈련장에서 전투 탭으로 이동.
export default function SparringPage() {
  const router = useRouter();
  const { viewerName, viewerGender, playerSubtitle, playerCombat } =
    useGameState();
  return (
    <V2SparringView
      playerName={viewerName}
      gender={viewerGender}
      playerSubtitle={playerSubtitle}
      playerCombat={
        playerCombat ? playerCombatToBattleStats(playerCombat) : undefined
      }
      onBack={() => router.push("/battle")}
    />
  );
}
