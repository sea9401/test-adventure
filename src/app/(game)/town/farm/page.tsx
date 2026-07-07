"use client";

import { useRouter } from "next/navigation";
import { AdventurerFarmPanel } from "@/adventure/v2/AdventurerFarmPanel";

// /town/farm — 모험가 농장(생활 재배 루프).
export default function FarmPage() {
  const router = useRouter();
  return <AdventurerFarmPanel onBack={() => router.push("/town")} />;
}
