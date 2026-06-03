"use client";

import { useRouter } from "next/navigation";
import { V2SkillLearnView } from "@/adventure/v2/V2SkillLearnView";

// /character/skills — 직업 패시브 + 스킬 학습 (옛 마을 훈련장에서 캐릭터 탭으로 이동).
export default function SkillsPage() {
  const router = useRouter();
  return <V2SkillLearnView onBack={() => router.push("/character")} />;
}
