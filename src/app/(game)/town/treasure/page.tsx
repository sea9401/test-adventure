"use client";

import { useRouter } from "next/navigation";
import { TreasureDisabledPanel } from "@/adventure/v2/TreasureDisabledPanel";

// /town/treasure — 발굴 감정소(발굴 + 보관함/대회 진입).
export default function TreasurePage() {
  const router = useRouter();
  return <TreasureDisabledPanel onBack={() => router.push("/town")} />;
}
