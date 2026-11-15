// 성장의 길(튜토리얼 순차 라인)에서 지금 할 단계 하나를 고른다. 사냥 결과 아래의 "다음 할 일" 카드가 쓴다.

import {
  V2_QUESTS,
  deriveQuestViews,
  type QuestCtx,
  type QuestReward,
} from "./v2Quests";

const GROWTH_LINE_ID = "growth";

export const GROWTH_GUIDE_QUEST_IDS: readonly string[] = V2_QUESTS.filter(
  (quest) => quest.line === GROWTH_LINE_ID,
).map((quest) => quest.id);

export type GrowthGuideStep = {
  id: string;
  title: string;
  desc: string;
  href: string | null;
  /** claimable = 조건을 채워 보상을 받을 수 있음, active = 진행 중. */
  status: "claimable" | "active";
  progress: number | null;
  goal: number | null;
  reward: QuestReward;
  /** 성장의 길에서 몇 번째 단계인지(1부터). */
  stepNumber: number;
  stepCount: number;
};

/** 받을 보상이 있는 단계가 먼저, 없으면 진행 중인 단계. 라인을 모두 받았으면 null. */
export function growthGuideStep(ctx: QuestCtx, claimed: ReadonlySet<string>): GrowthGuideStep | null {
  const views = deriveQuestViews(ctx, claimed).filter((view) => view.line === GROWTH_LINE_ID);
  const view =
    views.find((candidate) => candidate.status === "claimable") ??
    views.find((candidate) => candidate.status === "active");
  if (!view || (view.status !== "claimable" && view.status !== "active")) return null;
  return {
    id: view.id,
    title: view.title,
    desc: view.desc,
    href: view.href,
    status: view.status,
    progress: view.progress,
    goal: view.goal,
    reward: view.reward,
    stepNumber: GROWTH_GUIDE_QUEST_IDS.indexOf(view.id) + 1,
    stepCount: GROWTH_GUIDE_QUEST_IDS.length,
  };
}

const SHORTCUT_LABELS: Record<string, string> = {
  "/character/inventory": "인벤토리로 가기",
  "/character/shrine": "성장의 신전으로 가기",
};

/** 사냥터 밖에서 해야 하는 단계의 이동 버튼 문구. 사냥터에서 이어 가는 단계는 null. */
export function growthGuideShortcutLabel(href: string | null): string | null {
  return href ? SHORTCUT_LABELS[href] ?? null : null;
}
