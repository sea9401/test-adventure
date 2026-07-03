"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { TabBar } from "@/components/ui/TabBar";
import { V2SkillLearnView } from "@/adventure/v2/V2SkillLearnView";
import { V2CombatPatternView } from "@/adventure/v2/V2CombatPatternView";
import { V2_COMBAT_PATTERN_ENABLED } from "@/adventure/v2/combat/combatPattern";

// /character/skills — 스킬 허브. 학습(스킬 습득) · 스킬(SP 장착·프리셋) · 스킬 패턴(갬빗)을
// 한 화면에서 탭으로 전환한다. 옛 별도 "전투 패턴" 메뉴/라우트를 흡수. 스킬 패턴 탭은 플래그 on 일 때만.
type SkillTab = "learn" | "loadout" | "enhance" | "pattern";

export default function SkillsPage() {
  const router = useRouter();
  const back = () => router.push("/character");
  const [tab, setTab] = useState<SkillTab>("learn");

  const tabs = [
    { key: "learn" as const, label: "학습" },
    { key: "loadout" as const, label: "스킬" },
    { key: "enhance" as const, label: "강화" },
    ...(V2_COMBAT_PATTERN_ENABLED
      ? [{ key: "pattern" as const, label: "스킬 패턴" }]
      : []),
  ];

  return (
    <main className="mx-auto max-w-[720px] space-y-3 p-6 text-zinc-900 dark:text-zinc-100">
      <SubViewHeader title="스킬" onBack={back} />

      <TabBar
        tabs={tabs}
        active={tab}
        onChange={setTab}
        ariaLabel="스킬 탭"
        size="md"
      />

      {tab === "pattern" && V2_COMBAT_PATTERN_ENABLED ? (
        <V2CombatPatternView embedded onBack={back} />
      ) : tab === "learn" ? (
        <V2SkillLearnView embedded section="learn" onBack={back} />
      ) : tab === "loadout" ? (
        <V2SkillLearnView embedded section="loadout" onBack={back} />
      ) : (
        <V2SkillLearnView embedded section="enhance" onBack={back} />
      )}
    </main>
  );
}
