"use client";

import { useRouter } from "next/navigation";
import { V2MarketplaceView } from "@/adventure/v2/V2MarketplaceView";

// /plaza/market — 거래소. 장비·재료 매물 둘러보기·구매·등록·취소.
export default function MarketPage() {
  const router = useRouter();
  return <V2MarketplaceView onBack={() => router.push("/plaza")} />;
}
