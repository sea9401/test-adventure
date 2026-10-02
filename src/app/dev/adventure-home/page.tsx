"use client";

import { useState } from "react";
import { AdventureActivityChecklist } from "@/adventure/v2/AdventureActivityChecklist";
import type { AdventureActivityView } from "@/adventure/v2/adventureDashboard";
import { CompactCharacterSummary } from "@/adventure/v2/CompactCharacterSummary";
import { StaminaBar } from "@/adventure/v2/StaminaBar";
import { PageShell } from "@/components/ui/PageShell";

// 모험 탭 홈 미리보기 — 로그인 없이 그릴 수 있는 위젯(캐릭터 요약·스태미나·오늘의 모험)만 예시 데이터로 렌더.
const ACTIVITIES: AdventureActivityView[] = [
  { id: "farm_ready", group: "ready", tab: "life", title: "농장 수확", detail: "수확 가능 2칸", href: "/town/farm", state: "actionable", enabled: true, defaultEnabled: true },
  { id: "daily_hunt", group: "daily", tab: "battle", title: "일일 사냥", detail: "12 / 30", href: "/battle/dungeons", state: "in_progress", current: 12, target: 30, enabled: true, defaultEnabled: true },
  { id: "expedition", group: "daily", tab: "battle", title: "원정", detail: "3 / 3", href: "/battle/storm-expedition", state: "completed", current: 3, target: 3, enabled: true, defaultEnabled: true },
  { id: "arena", group: "weekly", tab: "battle", title: "아레나", detail: "2 / 5", href: "/battle/arena", state: "in_progress", current: 2, target: 5, enabled: true, defaultEnabled: true },
] as AdventureActivityView[];

export default function AdventureHomePreviewPage() {
  const [expanded, setExpanded] = useState(false);
  const [now] = useState(() => Date.now());
  return (
    <PageShell spacing="tight" className="py-3 sm:py-6">
      <CompactCharacterSummary
        character={{ name: "젠피", gender: "female1", level: 87, exp: 462, expToNext: 1_000, hp: 80, maxHp: 100, mp: 20, maxMp: 40, gold: 12_340_000 }}
        guild={{ id: 7, name: "은하수호대" }}
        levelCap={100}
        activePresetName="사냥용"
        expanded={expanded}
        onExpandedChange={setExpanded}
      >
        <div className="p-4 text-sm text-zinc-500">펼친 캐릭터 카드는 로그인 화면에서 확인합니다.</div>
      </CompactCharacterSummary>
      <StaminaBar state={{ current: 1840, lastUpdatedAt: now }} max={3000} regenBonusPct={20} potions={2} onUsePotion={() => undefined} />
      <AdventureActivityChecklist
        activities={ACTIVITIES}
        summary={{ completed: 1, total: 3, actionableCount: 1 }}
        serverNow={now}
        onRetry={() => undefined}
      />
    </PageShell>
  );
}
