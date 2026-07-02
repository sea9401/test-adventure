"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { V2SecretShopView } from "@/adventure/v2/V2SecretShopView";

// /hidden/shop?map=<iid> — 비밀 상점. map 생략 시 서버가 보유 중인 유효한 지도를 자동 선택.
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
