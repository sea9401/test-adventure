"use client";

import { useRouter } from "next/navigation";
import { FishingShopPanel } from "@/adventure/v2/FishingShopPanel";

// /town/fishing/shop — 낚시 코인 상점.
export default function FishingShopPage() {
  const router = useRouter();
  return <FishingShopPanel onBack={() => router.push("/town/fishing")} />;
}
