"use client";

import { useRouter } from "next/navigation";
import { useGameState } from "@/adventure/v2/GameStateProvider";
import { V2SparringView } from "@/adventure/v2/V2SparringView";

// /town/training/sparring — 대련(훈련장 안의 모의전).
export default function SparringPage() {
  const router = useRouter();
  const { viewerName, viewerGender, playerSubtitle } = useGameState();
  return (
    <V2SparringView
      playerName={viewerName}
      gender={viewerGender}
      playerSubtitle={playerSubtitle}
      onBack={() => router.push("/town/training")}
    />
  );
}
