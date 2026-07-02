"use client";

import { useRouter } from "next/navigation";
import { V2CoopBossListView } from "@/adventure/v2/coop/V2CoopBossListView";

// /battle/coop — 협동 보스 목록(소환된 인스턴스·소환하기·미수령 보상).
// 보스 클릭/소환 성공 → /battle/coop/[sessionId] 상세.
export default function CoopBossListPage() {
  const router = useRouter();
  return (
    <V2CoopBossListView
      onOpenSession={(sessionId) => router.push(`/battle/coop/${sessionId}`)}
      onOpenShop={() => router.push("/battle/coop/shop")}
      onBack={() => router.push("/battle")}
    />
  );
}
