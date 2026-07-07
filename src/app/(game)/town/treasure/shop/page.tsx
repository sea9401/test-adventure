"use client";

import { useRouter } from "next/navigation";
import { TreasureDisabledPanel } from "@/adventure/v2/TreasureDisabledPanel";

// /town/treasure/shop — 발굴 코인 상점.
export default function TreasureShopPage() {
  const router = useRouter();
  return <TreasureDisabledPanel onBack={() => router.push("/town")} />;
}
