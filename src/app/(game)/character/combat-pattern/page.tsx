"use client";

import { useRouter } from "next/navigation";
import { V2CombatPatternView } from "@/adventure/v2/V2CombatPatternView";

// /character/combat-pattern — 전투 패턴(갬빗) 에디터. V2_COMBAT_PATTERN_ENABLED on(2026-06-07
// go-live) — 메뉴 링크 노출 + 저장한 패턴이 전투에 반영(조건 충족=확정 발동, 평타 기준 보너스 보정).
export default function CombatPatternPage() {
  const router = useRouter();
  return <V2CombatPatternView onBack={() => router.push("/character")} />;
}
