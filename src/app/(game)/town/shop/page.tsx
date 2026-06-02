"use client";

import { useRouter } from "next/navigation";
import { V2ShopView } from "@/adventure/v2/V2ShopView";

// /town/shop — 상점(물약 구매·재료/장비 거래).
export default function ShopPage() {
  const router = useRouter();
  return <V2ShopView onBack={() => router.push("/town")} />;
}
