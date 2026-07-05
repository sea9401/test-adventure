"use client";

import { useParams, useRouter } from "next/navigation";
import { useGameState } from "@/adventure/v2/GameStateProvider";
import { V2CoopBossDetailView } from "@/adventure/v2/coop/V2CoopBossDetailView";

// /battle/coop/[sessionId] — 협동 보스 인스턴스 상세(공격·참전자 명단·보상 수령).
// sessionId 는 uuid(ASCII)라 Next16 param 인코딩 비대칭 무관. 존재 검증은 서버(404).
export default function CoopBossDetailPage() {
  const router = useRouter();
  const params = useParams<{ sessionId: string }>();
  const {
    viewerName,
    viewerGender,
    playerSubtitle,
    stamina,
    staminaMax,
    setStamina,
  } = useGameState();
  return (
    <V2CoopBossDetailView
      sessionId={params.sessionId}
      playerName={viewerName}
      playerGender={viewerGender}
      playerSubtitle={playerSubtitle}
      stamina={stamina}
      staminaMax={staminaMax}
      setStamina={setStamina}
      onBack={() => router.push("/battle/coop")}
    />
  );
}
