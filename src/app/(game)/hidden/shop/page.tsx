"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { V2SecretShopView } from "@/adventure/v2/V2SecretShopView";

// /hidden/shop?map=<iid> — 비밀 상점. 「비밀 상점의 지도」(인벤토리 소모품 탭)로 입장.
export default function SecretShopPage() {
  const router = useRouter();
  const mapIid = useSearchParams().get("map") ?? "";
  return (
    <V2SecretShopView
      mapIid={mapIid}
      onBack={() => router.push("/character/inventory")}
    />
  );
}
