"use client";

import { useRouter } from "next/navigation";
import { V2CombatPatternView } from "@/adventure/v2/V2CombatPatternView";

// /character/combat-pattern — 전투 패턴(갬빗) 에디터 standalone 라우트(딥링크 호환).
// 기본 진입은 이제 캐릭터 > 스킬 화면의 "전투패턴" 탭(/character/skills). 메뉴 링크는 그리로
// 흡수돼 이 라우트는 unlinked fallback. 저장한 패턴이 전투에 반영(조건 충족=확정 발동).
export default function CombatPatternPage() {
  const router = useRouter();
  return <V2CombatPatternView onBack={() => router.push("/character")} />;
}
