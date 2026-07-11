"use client";

import { useParams, useRouter } from "next/navigation";
import { useGameState } from "@/adventure/v2/GameStateProvider";
import { V2CoopAttackLogView } from "@/adventure/v2/coop/V2CoopAttackLogView";

// /battle/coop/[sessionId]/log/[attackId] — 아레나처럼 분리된 협동 보스 전투 로그.
export default function CoopAttackLogPage() {
  const router = useRouter();
  const params = useParams<{ sessionId: string; attackId: string }>();
  const { viewerGender, playerSubtitle } = useGameState();
  const detailHref = `/battle/coop/${encodeURIComponent(params.sessionId)}`;

  return (
    <V2CoopAttackLogView
      sessionId={params.sessionId}
      attackId={params.attackId}
      viewerGender={viewerGender}
      playerSubtitle={playerSubtitle}
      onBack={() => router.push(detailHref)}
    />
  );
}
