"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { HeaderPanel } from "@/components/ui/HeaderPanel";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { TabBar } from "@/components/ui/TabBar";
import { V2SkillLearnView } from "@/adventure/v2/V2SkillLearnView";
import { V2CombatPatternView } from "@/adventure/v2/V2CombatPatternView";
import { V2_COMBAT_PATTERN_ENABLED } from "@/adventure/v2/combat/combatPattern";

// /character/skills — 스킬 허브. 로드아웃(스킬 학습·SP 장착)과 전투패턴(갬빗)을 한 화면에서
// 탭으로 전환한다. 옛 별도 "전투 패턴" 메뉴/라우트를 흡수. 전투패턴 탭은 플래그 on 일 때만.
type SkillTab = "loadout" | "pattern";

export default function SkillsPage() {
  const router = useRouter();
  const back = () => router.push("/character");
  const [tab, setTab] = useState<SkillTab>("loadout");

  const tabs = [
    { key: "loadout" as const, label: "로드아웃" },
    ...(V2_COMBAT_PATTERN_ENABLED
      ? [{ key: "pattern" as const, label: "전투패턴" }]
      : []),
  ];

  return (
    <main className="mx-auto max-w-[720px] space-y-3 p-6 text-zinc-900 dark:text-zinc-100">
      <HeaderPanel>
        <SubViewHeader title="스킬" onBack={back} />
      </HeaderPanel>

      {V2_COMBAT_PATTERN_ENABLED && (
        <TabBar
          tabs={tabs}
          active={tab}
          onChange={setTab}
          ariaLabel="스킬 탭"
          size="md"
        />
      )}

      {tab === "pattern" && V2_COMBAT_PATTERN_ENABLED ? (
        <V2CombatPatternView embedded onBack={back} />
      ) : (
        <V2SkillLearnView embedded onBack={back} />
      )}
    </main>
  );
}
