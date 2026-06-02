"use client";

import { useRouter } from "next/navigation";
import { V2CultivationView } from "@/adventure/v2/V2CultivationView";

// /town/shrine — 성장의 신전(숙달 포인트로 능력치 cap 상승).
export default function ShrinePage() {
  const router = useRouter();
  return <V2CultivationView onBack={() => router.push("/town")} />;
}
