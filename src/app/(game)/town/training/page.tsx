"use client";

import { useRouter } from "next/navigation";
import { V2SkillLearnView } from "@/adventure/v2/V2SkillLearnView";

// /town/training — 훈련장(스킬 학습 + 대련 진입).
export default function TrainingPage() {
  const router = useRouter();
  return (
    <V2SkillLearnView
      onBack={() => router.push("/town")}
      onStartSparring={() => router.push("/town/training/sparring")}
    />
  );
}
