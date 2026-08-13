"use client";

import { useRouter } from "next/navigation";
import { useGameState } from "@/adventure/v2/GameStateProvider";
import { V2SparringView } from "@/adventure/v2/V2SparringView";
import { playerCombatToBattleStats } from "@/adventure/v2/PlayerStatusCard";

export function SparringPageClient({
  initialMode,
  initialTargetName,
}: {
  initialMode: "dummy" | "friendly";
  initialTargetName?: string;
}) {
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
      initialMode={initialMode}
      initialTargetName={initialTargetName}
      onBack={() => router.push("/battle")}
    />
  );
}
