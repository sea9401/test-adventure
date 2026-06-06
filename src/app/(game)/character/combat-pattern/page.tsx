"use client";

import { useRouter } from "next/navigation";
import { V2CombatPatternView } from "@/adventure/v2/V2CombatPatternView";

// /character/combat-pattern — 전투 패턴(갬빗) 에디터. 플래그 off 동안엔 메뉴 링크 미노출(직접 URL
// 접근만), 저장은 동작하나 전투 반영은 V2_COMBAT_PATTERN_ENABLED on 후(C3 재밸런스 완료).
export default function CombatPatternPage() {
  const router = useRouter();
  return <V2CombatPatternView onBack={() => router.push("/character")} />;
}
