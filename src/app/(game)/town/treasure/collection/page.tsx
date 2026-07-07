"use client";

import { useRouter } from "next/navigation";
import { TreasureDisabledPanel } from "@/adventure/v2/TreasureDisabledPanel";

// /town/treasure/collection — 골동품 보관함(분해/도감 + 상점 진입).
export default function TreasureCollectionPage() {
  const router = useRouter();
  return <TreasureDisabledPanel onBack={() => router.push("/town")} />;
}
