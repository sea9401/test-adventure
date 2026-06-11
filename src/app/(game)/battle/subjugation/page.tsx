"use client";

import { useRouter } from "next/navigation";
import { V2SubjugationView } from "@/adventure/v2/V2SubjugationView";

// /battle/subjugation — 토벌. 내 길드 보유 거점의 침입자 목록 + 1대1 토벌.
export default function SubjugationPage() {
  const router = useRouter();
  return <V2SubjugationView onBack={() => router.push("/battle")} />;
}
