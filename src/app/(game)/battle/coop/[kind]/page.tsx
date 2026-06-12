"use client";

import { notFound, useParams, useRouter } from "next/navigation";
import { useGameState } from "@/adventure/v2/GameStateProvider";
import { V2CoopBossDetailView } from "@/adventure/v2/coop/V2CoopBossDetailView";
import { parseCoopBossKindId } from "@/adventure/data/v2/coopBosses";

// /battle/coop/[kind] — 협동 보스 상세(소환·공격·참전자 명단).
// kind 는 ASCII id(mountain_chief 등)라 인코딩 비대칭 무관.
export default function CoopBossDetailPage() {
  const router = useRouter();
  const params = useParams<{ kind: string }>();
  const kind = parseCoopBossKindId(params.kind);
  const {
    viewerName,
    viewerGender,
    playerSubtitle,
    stamina,
    setStamina,
    setHp,
  } = useGameState();
  if (!kind) notFound();
  return (
    <V2CoopBossDetailView
      kind={kind}
      playerName={viewerName}
      playerGender={viewerGender}
      playerSubtitle={playerSubtitle}
      stamina={stamina}
      setStamina={setStamina}
      setHp={setHp}
      onBack={() => router.push("/battle/coop")}
    />
  );
}
