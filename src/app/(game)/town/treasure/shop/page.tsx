"use client";

import { useRouter } from "next/navigation";
import { TreasureShopPanel } from "@/adventure/v2/TreasureShopPanel";

// /town/treasure/shop — 발굴 코인 상점.
export default function TreasureShopPage() {
  const router = useRouter();
  return (
    <TreasureShopPanel onBack={() => router.push("/town/treasure/collection")} />
  );
}
