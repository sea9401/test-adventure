import { displayCodexMasteryScore, emptyCodexMasteryProgress } from "@/adventure/data/v2/codexMastery";
import type { CodexMasteryCatalog } from "@/adventure/data/v2/codexMasteryCatalog";
import { CODEX_MASTERY_CATALOG } from "@/adventure/data/v2/codexMasteryProductionCatalog";
import {
  CODEX_MASTERY_CATEGORIES,
  CODEX_MASTERY_STAGES,
  type CodexMasteryCategory,
  type CodexMasteryCountStage,
  type CodexMasteryProgress,
  type CodexMasteryStage,
  type CodexMasteryTier,
} from "@/adventure/data/v2/codexMasteryTypes";
import type {
  CodexMasteryEntryView,
  CodexMasteryGoalView,
  CodexMasteryPinnedGoal,
  CodexMasteryPromotionView,
  CodexMasterySnapshot,
  CodexMasteryViewFeatures,
} from "@/adventure/data/v2/codexMasteryView";
import type { CodexMasterySummaryState } from "./codexMasteryRepository";

const COUNT_STAGES: readonly CodexMasteryCountStage[] = [
  "bronze",
  "silver",
  "gold",
  "platinum",
  "diamond",
  "legendary",
];

function entryKey(category: CodexMasteryCategory, entryId: string): string {
  return `${category}:${entryId}`;
}

function tierIndex(tier: CodexMasteryTier): number {
  return tier === "none" ? -1 : CODEX_MASTERY_STAGES.indexOf(tier);
}

function nextGoal(
  progress: CodexMasteryProgress,
  thresholds: Record<CodexMasteryCountStage, number>,
): Pick<CodexMasteryEntryView, "nextStage" | "nextThreshold" | "nextProgressPercent"> {
  if (progress.currentTier === "none") {
    return {
      nextStage: "discovered",
      nextThreshold: null,
      nextProgressPercent: 0,
    };
  }
  if (progress.currentTier === "legendary") {
    return { nextStage: null, nextThreshold: null, nextProgressPercent: 100 };
  }
  const nextStage = COUNT_STAGES.find(
    (stage) => tierIndex(stage) > tierIndex(progress.currentTier),
  ) ?? null;
  if (!nextStage) {
    return { nextStage: null, nextThreshold: null, nextProgressPercent: 100 };
  }
  const nextThreshold = thresholds[nextStage];
  return {
    nextStage,
    nextThreshold,
    nextProgressPercent: Math.min(
      100,
      Math.max(0, Math.round((progress.count / nextThreshold) * 100)),
    ),
  };
}

function promotionSort(
  left: CodexMasteryPromotionView,
  right: CodexMasteryPromotionView,
): number {
  return right.achievedAt.localeCompare(left.achievedAt) ||
    left.key.localeCompare(right.key) ||
    CODEX_MASTERY_STAGES.indexOf(right.stage) -
      CODEX_MASTERY_STAGES.indexOf(left.stage);
}

function nearGoal(entry: CodexMasteryEntryView): CodexMasteryGoalView | null {
  if (
    entry.currentTier === "none" ||
    entry.currentTier === "legendary" ||
    entry.count <= 0 ||
    entry.nextStage === null ||
    entry.nextStage === "discovered" ||
    entry.nextThreshold === null
  ) {
    return null;
  }
  return {
    key: entry.key,
    category: entry.category,
    entryId: entry.entryId,
    label: entry.label,
    currentTier: entry.currentTier,
    count: entry.count,
    nextStage: entry.nextStage,
    nextThreshold: entry.nextThreshold,
    nextProgressPercent: entry.nextProgressPercent,
    pinned: entry.pinned,
  };
}

export function buildCodexMasterySnapshot({
  summary,
  progressRows,
  pinnedGoals,
  features,
  catalog = CODEX_MASTERY_CATALOG,
}: {
  summary: CodexMasterySummaryState;
  progressRows: readonly CodexMasteryProgress[];
  pinnedGoals: readonly CodexMasteryPinnedGoal[];
  features: CodexMasteryViewFeatures;
  catalog?: CodexMasteryCatalog;
}): CodexMasterySnapshot {
  const progressByKey = new Map<string, CodexMasteryProgress>();
  for (const progress of progressRows) {
    if (catalog.get(progress.category, progress.entryId)) {
      progressByKey.set(entryKey(progress.category, progress.entryId), progress);
    }
  }
  const pinnedKeys = new Set(
    pinnedGoals.map((goal) => entryKey(goal.category, goal.entryId)),
  );

  const entries = catalog.list().map((definition): CodexMasteryEntryView => {
    const key = entryKey(definition.category, definition.entryId);
    const progress = progressByKey.get(key) ??
      emptyCodexMasteryProgress(definition.category, definition.entryId);
    return {
      key,
      category: definition.category,
      entryId: definition.entryId,
      label: definition.label,
      count: progress.count,
      bestValue: progress.bestValue,
      currentTier: progress.currentTier,
      score: displayCodexMasteryScore(progress.scoreMilli),
      thresholds: { ...definition.thresholds },
      tierAchievedAt: { ...progress.tierAchievedAt },
      sealIds: [...progress.sealIds],
      availableSealIds: Object.keys(definition.seals),
      ...nextGoal(progress, definition.thresholds),
      pinned: pinnedKeys.has(key),
    };
  });

  const recentPromotions = entries
    .flatMap((entry) => Object.entries(entry.tierAchievedAt).map(
      ([stage, achievedAt]): CodexMasteryPromotionView => ({
        key: entry.key,
        category: entry.category,
        entryId: entry.entryId,
        label: entry.label,
        stage: stage as CodexMasteryStage,
        achievedAt,
      }),
    ))
    .sort(promotionSort)
    .slice(0, 5);

  const nearGoals = entries
    .map(nearGoal)
    .filter((goal): goal is CodexMasteryGoalView => goal !== null)
    .sort((left, right) =>
      right.nextProgressPercent - left.nextProgressPercent ||
      left.key.localeCompare(right.key)
    )
    .slice(0, 5);

  const goldIndex = tierIndex("gold");
  const categories = CODEX_MASTERY_CATEGORIES.map((category) => {
    const categoryEntries = entries.filter((entry) => entry.category === category);
    return {
      category,
      score: displayCodexMasteryScore(summary.categoryScoreMilli[category]),
      discoveredCount: categoryEntries.filter((entry) => entry.currentTier !== "none").length,
      totalEntries: categoryEntries.length,
      goldOrHigherCount: categoryEntries.filter(
        (entry) => tierIndex(entry.currentTier) >= goldIndex,
      ).length,
    };
  });

  return {
    summary: {
      totalScore: displayCodexMasteryScore(summary.totalScoreMilli),
      discoveredCount: entries.filter((entry) => entry.currentTier !== "none").length,
      totalEntries: entries.length,
      sealCount: summary.sealCount,
      stageCounts: { ...summary.stageCounts },
    },
    categories,
    entries,
    pinnedGoals: pinnedGoals.map((goal) => ({ ...goal })),
    recentPromotions,
    nearGoals,
    features: { ...features },
  };
}
