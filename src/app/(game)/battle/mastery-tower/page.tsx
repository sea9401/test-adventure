"use client";

import { useRouter } from "next/navigation";
import { useGameState } from "@/adventure/v2/GameStateProvider";
import { V2MasteryTowerView } from "@/adventure/v2/V2MasteryTowerView";

export default function MasteryTowerPage() {
  const router = useRouter();
  const { refreshGameState } = useGameState();
  return (
    <V2MasteryTowerView
      onBack={() => router.push("/battle")}
      onRefreshGameState={refreshGameState}
    />
  );
}
