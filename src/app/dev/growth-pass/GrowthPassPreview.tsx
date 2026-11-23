"use client";

import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { GROWTH_PASS, GROWTH_PASS_LINE_ID } from "@/adventure/data/v2/growthPass";
import {
  QUEST_LINES,
  questStatus,
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
    title: "가입 12일째, 4차 직업 숙련도 5,339",
    ctx: { tier: 4, maxJobTier: 4, tierMastery: { 4: 5_339 }, newcomer: true },
    claimed: ["gp_tier4"],
  },
  {
    title: "가입 9일째, 방금 4차 전직",
    ctx: { tier: 4, maxJobTier: 4, tierMastery: { 4: 40 }, newcomer: true },
    claimed: [],
  },
  {
    title: "기존 계정, 6차 직업(지난 단계 소급)",
    ctx: {
      tier: 6,
      maxJobTier: 6,
      tierMastery: { 4: 19_200, 5: 36_400, 6: 41_000 },
      newcomer: false,
    },
    claimed: [],
  },
];

function passViews(scenario: Scenario): QuestView[] {
  const ctx = scenario.ctx as QuestCtx;
  const claimed = new Set(scenario.claimed);
  return GROWTH_PASS.map((step) => ({
    id: step.id,
    line: step.line,
    title: step.title,
    desc: step.desc,
    href: step.href ?? null,
    reward: step.reward,
    newcomerBonus: ctx.newcomer && step.newcomerBonus ? step.newcomerBonus : null,
    status: questStatus(step, ctx, claimed),
    points: 0,
    progress: step.progress ? Math.floor(step.progress(ctx)) : null,
    goal: step.goal ?? null,
    detailKind: null,
  }));
}

const LINE = QUEST_LINES.find((line) => line.id === GROWTH_PASS_LINE_ID)!;

export function GrowthPassPreview() {
  return (
    <PageShell>
      {SCENARIOS.map((scenario) => {
        const views = passViews(scenario);
        const plan = homeGuidePlan(views, null, null);
        const open = views.filter((view) => view.status !== "claimed");
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
            <Card padding="md" className="space-y-3">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold">{LINE.name}</h2>
                <span className="text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                  현재 목표 {open.length}개
                </span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {LINE.subtitle}
              </p>
              <ul className="space-y-1.5">
                {open.map((view) => (
                  <QuestRow key={view.id} quest={view} busy={false} onClaim={() => {}} />
                ))}
              </ul>
            </Card>
          </section>
        );
      })}
    </PageShell>
  );
}
