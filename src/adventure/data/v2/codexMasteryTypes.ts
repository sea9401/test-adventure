export const CODEX_MASTERY_CATEGORIES = [
  "equipment",
  "fish",
  "monster",
  "cooking",
  "life",
  "job",
] as const;

export const CODEX_MASTERY_STAGES = [
  "discovered",
  "bronze",
  "silver",
  "gold",
  "platinum",
  "diamond",
  "legendary",
] as const;

export const CODEX_MASTERY_POINT_UNITS = {
  discovered: 1,
  bronze: 1,
  silver: 2,
  gold: 3,
  platinum: 4,
  diamond: 5,
  legendary: 6,
} as const;

export type CodexMasteryCategory = (typeof CODEX_MASTERY_CATEGORIES)[number];
export type CodexMasteryStage = (typeof CODEX_MASTERY_STAGES)[number];
export type CodexMasteryTier = "none" | CodexMasteryStage;
export type CodexMasteryCountStage = Exclude<CodexMasteryStage, "discovered">;

export type CodexMasteryEntryDefinition = {
  category: CodexMasteryCategory;
  entryId: string;
  label: string;
  thresholds: Record<CodexMasteryCountStage, number>;
  scoreWeightMilli: number;
  compatibleScoreWeightsMilli?: readonly number[];
  seals: Readonly<Record<string, { pointUnits: 2 | 4 }>>;
};

export type CodexMasteryProgress = {
  category: CodexMasteryCategory;
  entryId: string;
  count: number;
  bestValue: number | null;
  currentTier: CodexMasteryTier;
  sealIds: string[];
  tierAchievedAt: Partial<Record<CodexMasteryStage, string>>;
  scoreMilli: number;
};

export type CodexMasteryMutation = {
  amount: number;
  discovered?: boolean;
  bestValue?: number;
  sealIds?: readonly string[];
};

export type CodexMasteryTransition = {
  next: CodexMasteryProgress;
  newStages: CodexMasteryStage[];
  newSealIds: string[];
  scoreDeltaMilli: number;
};
