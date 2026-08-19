import type {
  CodexMasteryCategory,
  CodexMasteryCountStage,
  CodexMasteryStage,
  CodexMasteryTier,
} from "./codexMasteryTypes";

export type CodexMasteryPinnedGoal = {
  category: CodexMasteryCategory;
  entryId: string;
};

export type CodexMasteryViewFeatures = {
  rankingVisible: boolean;
  sealsEnabled: boolean;
  trophiesEnabled: boolean;
  monthlyProgressEnabled: boolean;
};

export type CodexMasteryEntryView = {
  key: string;
  category: CodexMasteryCategory;
  entryId: string;
  label: string;
  count: number;
  bestValue: number | null;
  currentTier: CodexMasteryTier;
  score: number;
  thresholds: Record<CodexMasteryCountStage, number>;
  tierAchievedAt: Partial<Record<CodexMasteryStage, string>>;
  sealIds: string[];
  availableSealIds: string[];
  nextStage: CodexMasteryStage | null;
  nextThreshold: number | null;
  nextProgressPercent: number;
  pinned: boolean;
};

export type CodexMasteryCategoryView = {
  category: CodexMasteryCategory;
  score: number;
  discoveredCount: number;
  totalEntries: number;
  goldOrHigherCount: number;
};

export type CodexMasteryPromotionView = {
  key: string;
  category: CodexMasteryCategory;
  entryId: string;
  label: string;
  stage: CodexMasteryStage;
  achievedAt: string;
};

export type CodexMasteryGoalView = {
  key: string;
  category: CodexMasteryCategory;
  entryId: string;
  label: string;
  currentTier: CodexMasteryTier;
  count: number;
  nextStage: CodexMasteryStage;
  nextThreshold: number;
  nextProgressPercent: number;
  pinned: boolean;
};

export type CodexMasterySnapshot = {
  summary: {
    totalScore: number;
    discoveredCount: number;
    totalEntries: number;
    sealCount: number;
    stageCounts: Record<CodexMasteryCountStage, number>;
  };
  categories: CodexMasteryCategoryView[];
  entries: CodexMasteryEntryView[];
  pinnedGoals: CodexMasteryPinnedGoal[];
  recentPromotions: CodexMasteryPromotionView[];
  nearGoals: CodexMasteryGoalView[];
  features: CodexMasteryViewFeatures;
};

export type CodexMasteryOverviewResponse =
  | { ok: true; enabled: false }
  | { ok: true; enabled: true; snapshot: CodexMasterySnapshot }
  | { ok: false; error: string };
