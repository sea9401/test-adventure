"use client";

import { useRouter } from "next/navigation";
import { useGameState } from "@/adventure/v2/GameStateProvider";
import { V2CoopBossView } from "@/adventure/v2/V2CoopBossView";

// /battle/coop — 협동 보스(소환서 소환·공유 HP 토벌).
export default function CoopBossPage() {
  const router = useRouter();
  const {
    viewerName,
    viewerGender,
    playerSubtitle,
    stamina,
    setStamina,
    setHp,
  } = useGameState();
  return (
    <V2CoopBossView
      playerName={viewerName}
      playerGender={viewerGender}
      playerSubtitle={playerSubtitle}
      stamina={stamina}
      setStamina={setStamina}
      setHp={setHp}
      onBack={() => router.push("/battle")}
    />
  );
}
