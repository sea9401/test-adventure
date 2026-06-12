"use client";

import { useRouter } from "next/navigation";
import { useGameState } from "@/adventure/v2/GameStateProvider";
import { V2SparringView } from "@/adventure/v2/V2SparringView";

// /battle/sparring — 훈련장(허수아비 모의전). 옛 마을 훈련장에서 전투 탭으로 이동.
export default function SparringPage() {
  const router = useRouter();
  const { viewerName, viewerGender, playerSubtitle } = useGameState();
  return (
    <V2SparringView
      playerName={viewerName}
      gender={viewerGender}
      playerSubtitle={playerSubtitle}
      onBack={() => router.push("/battle")}
    />
  );
}
