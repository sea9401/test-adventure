"use client";

import { useRouter } from "next/navigation";
import { KitchenPanel } from "@/adventure/v2/KitchenPanel";

// /town/kitchen — 농장과 낚시 재료를 함께 사용하는 독립 생활 콘텐츠.
export default function KitchenPage() {
  const router = useRouter();
  return (
    <KitchenPanel
      onBack={() => router.push("/town")}
      onOpenFarm={() => router.push("/town/farm")}
    />
  );
}
