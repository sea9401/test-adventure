"use client";

import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { isGrowthPassLine } from "@/adventure/data/v2/growthPass";
import {
  QUEST_LINES,
  deriveQuestViews,
  type QuestCtx,
  type QuestView,
} from "@/adventure/data/v2/v2Quests";
import {
  CurrentGoalBanner,
  GrowthPassRewardBanner,
  homeGuidePlan,
} from "@/adventure/v2/GuideQuestBanner";
import { QuestRow } from "@/adventure/v2/V2QuestView";

type Scenario = {
  title: string;
  ctx: Partial<QuestCtx>;
  claimed: string[];
};

const SCENARIOS: Scenario[] = [
  {
    title: "가입 6일째, 3차 직업",
    ctx: {
      tier: 3,
      maxJobTier: 3,
      frontierDepth: 34,
      cultivations: 22,
      cultivationsTotal: 22,
      maxEnhanceLevel: 3,
      newcomer: true,
    },
    claimed: [],
  },
  {
    title: "가입 12일째, 4차 직업 숙련도 5,339",
    ctx: {
      tier: 4,
      maxJobTier: 4,
      tierMastery: { 4: 5_339 },
      frontierDepth: 50,
      coopBossKindIds: ["mountain_chief"],
      cultivations: 41,
      cultivationsTotal: 41,
      masteryTowerFloor: 2,
      maxEnhanceLevel: 6,
      newcomer: true,
    },
    claimed: ["gp_depth37", "gp_boss_mountain", "gp_cult30", "gp_enh5", "gp_tier4", "gp_depth49"],
  },
  {
    title: "기존 계정, 6차 직업(달성한 목표 소급)",
    ctx: {
      tier: 6,
      maxJobTier: 6,
      tierMastery: { 4: 19_200, 5: 36_400, 6: 41_000 },
      frontierDepth: 84,
      coopBossKindIds: ["mountain_chief", "canyon_predator", "lake_sovereign"],
      cultivations: 400,
      cultivationsTotal: 400,
      masteryTowerFloor: 59,
      maxEnhanceLevel: 9,
      hasGuild: true,
      newcomer: false,
    },
    claimed: [],
  },
];

// 미리보기는 성장 패스가 보는 값만 채운다. 다른 퀘스트 조건은 평가하지 않는다.
const BASE = {
  class: "warrior",
  level: 100,
  tier: 3,
  frontierDepth: 2,
  cultivations: 0,
  masteryTowerFloor: 0,
  maxEnhanceLevel: 0,
  hasGuild: false,
} as unknown as QuestCtx;

function passViews(scenario: Scenario): QuestView[] {
  const ctx = { ...BASE, ...scenario.ctx } as QuestCtx;
  const claimed = new Set(scenario.claimed);
  const views: QuestView[] = [];
  try {
    for (const view of deriveQuestViews(ctx, claimed)) {
      if (isGrowthPassLine(view.line)) views.push(view);
    }
  } catch {
    // 다른 줄의 조건이 미리보기용 값으로 평가되지 않아도 성장 패스 줄은 그대로 보여 준다.
  }
  return views;
}

const PASS_LINES = QUEST_LINES.filter((line) => isGrowthPassLine(line.id));

export function GrowthPassPreview() {
  return (
    <PageShell>
      {SCENARIOS.map((scenario) => {
        const views = passViews(scenario);
        const plan = homeGuidePlan(views, null, null);
        return (
          <section key={scenario.title} className="space-y-2">
            <SectionHeading title={scenario.title} />
            <GrowthPassRewardBanner items={plan.passClaimable} onOpen={() => {}} />
            {plan.goal && (
              <CurrentGoalBanner
                current={plan.goal}
                label="성장 패스"
                onOpen={() => {}}
              />
            )}
            {PASS_LINES.map((line) => {
              const open = views.filter(
                (view) => view.line === line.id && view.status !== "claimed",
              );
              if (open.length === 0) return null;
              return (
                <Card key={line.id} padding="md" className="space-y-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <h2 className="text-sm font-semibold">{line.name}</h2>
                    <span className="text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                      현재 목표 {open.length}개
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {line.subtitle}
                  </p>
                  <ul className="space-y-1.5">
                    {open.map((view) => (
                      <QuestRow
                        key={view.id}
                        quest={view}
                        busy={false}
                        onClaim={() => {}}
                      />
                    ))}
                  </ul>
                </Card>
              );
            })}
          </section>
        );
      })}
    </PageShell>
  );
}
