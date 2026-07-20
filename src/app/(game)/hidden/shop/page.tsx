"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { V2SecretShopView } from "@/adventure/v2/V2SecretShopView";

// /hidden/shop?map=<iid> — 열린 「비밀 상점 지도」로 입장.
export default function SecretShopPage() {
  const router = useRouter();
  const mapIid = useSearchParams().get("map") ?? "";
  return (
    <V2SecretShopView
      mapIid={mapIid}
      onBack={() => router.push("/battle/dungeon")}
    />
  );
}
