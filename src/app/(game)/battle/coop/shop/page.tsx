"use client";

import { useRouter } from "next/navigation";
import { V2CoopShopView } from "@/adventure/v2/coop/V2CoopShopView";

// /battle/coop/shop — 협동 교환소. 토벌 목록과 분리된 협동 보스 서브 탭.
export default function CoopShopPage() {
  const router = useRouter();
  return (
    <V2CoopShopView
      onOpenBosses={() => router.push("/battle/coop")}
      onBack={() => router.push("/battle")}
    />
  );
}
