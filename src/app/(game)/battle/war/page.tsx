"use client";

import { useRouter } from "next/navigation";
import { V2WarView } from "@/adventure/v2/V2WarView";

// /battle/war — 전황(교전 중 거점·최근 점령·내 길드 거점). 전투 탭으로 묶인다.
export default function WarPage() {
  const router = useRouter();
  return (
    <V2WarView
      onBack={() => router.push("/battle")}
      onOpenOutpost={(id) => router.push(`/outpost/${id}`)}
    />
  );
}
