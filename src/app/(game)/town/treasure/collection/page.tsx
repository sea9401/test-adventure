"use client";

import { useRouter } from "next/navigation";
import { TreasureCollectionPanel } from "@/adventure/v2/TreasureCollectionPanel";

// /town/treasure/collection — 골동품 보관함(분해/도감 + 상점 진입).
export default function TreasureCollectionPage() {
  const router = useRouter();
  return (
    <TreasureCollectionPanel
      onBack={() => router.push("/town/treasure")}
      onOpenShop={() => router.push("/town/treasure/shop")}
    />
  );
}
