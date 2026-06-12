"use client";

import { useRouter } from "next/navigation";
import { useGameState } from "@/adventure/v2/GameStateProvider";
import { V2CoopBossListView } from "@/adventure/v2/coop/V2CoopBossListView";

// /battle/coop — 협동 보스 목록(현황·미수령 보상). 보스 클릭 → /battle/coop/[kind] 상세.
export default function CoopBossListPage() {
  const router = useRouter();
  const { setStamina } = useGameState();
  return (
    <V2CoopBossListView
      setStamina={setStamina}
      onOpenBoss={(kind) => router.push(`/battle/coop/${kind}`)}
      onBack={() => router.push("/battle")}
    />
  );
}
