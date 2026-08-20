import {
  CODEX_RESEARCH_DIVERSITY_SCORE,
  CODEX_RESEARCH_GROUP_COUNTS,
  CODEX_RESEARCH_MAX_SCORE,
  CODEX_RESEARCH_OBJECTIVE_COUNT,
  CODEX_RESEARCH_OBJECTIVE_SCORE,
  CODEX_RESEARCH_RECORD_SCORE,
  kstCodexResearchSeasonWindow,
  validateCodexResearchSeasonDefinition,
  type CodexResearchDefinitionSnapshot,
} from "./codexResearch";
import type { CodexMasteryCategory } from "./codexMasteryTypes";
import {
  CODEX_MASTERY_TROPHY_TIERS,
  type CodexMasteryTrophyTier,
} from "./codexMasteryTrophies";
import { codexResearchTierFor, type CodexResearchTier } from "./codexResearchRanking";

export type CodexResearchDefinitionPreview = {
  seasonId: string;
  themeId: string;
  themeName: string;
  version: number;
  startAt: string;
  endAt: string;
  primaryCategories: [CodexMasteryCategory, CodexMasteryCategory];
  supportCategory: CodexMasteryCategory;
  objectiveCount: number;
  groupCounts: Record<keyof typeof CODEX_RESEARCH_GROUP_COUNTS, number>;
  objectiveScore: number;
  diversityScore: number;
  recordScore: number;
  schedulable: boolean;
};

export type CodexResearchSettlementPreviewCandidate = {
  userId: string;
  finalRank: number;
  score: number;
  objectiveCompletedCount: number;
  diversityScore: number;
  recordScore: number;
};

export type CodexResearchSettlementPreviewRow = {
  userId: string;
  rank: number;
  score: number;
  tier: CodexResearchTier;
};

export type CodexResearchSettlementPreview = {
  seasonId: string;
  participantCount: number;
  tierCounts: Record<CodexMasteryTrophyTier, number>;
  untieredCount: number;
  top: CodexResearchSettlementPreviewRow[];
};

export type CodexResearchConfirmationOperation =
  | "schedule"
  | "settle"
  | "resettle"
  | "award-trophies";

function validDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function seasonIdFromDefinition(definition: unknown): string {
  if (
    definition === null ||
    typeof definition !== "object" ||
    Array.isArray(definition) ||
    typeof (definition as Record<string, unknown>).seasonId !== "string"
  ) {
    throw new Error("seasonId must be non-empty");
  }
  return (definition as Record<string, unknown>).seasonId as string;
}

export function previewCodexResearchDefinition(
  definition: unknown,
  now: Date,
): CodexResearchDefinitionPreview {
  if (!validDate(now)) throw new Error("now must be a valid date");
  const window = kstCodexResearchSeasonWindow(seasonIdFromDefinition(definition));
  const validationError = validateCodexResearchSeasonDefinition(definition, window);
  if (validationError) throw new Error(validationError);

  const snapshot = definition as CodexResearchDefinitionSnapshot;
  const groupCounts = {
    basic: snapshot.objectives.filter((item) => item.group === "basic").length,
    field: snapshot.objectives.filter((item) => item.group === "field").length,
    expert: snapshot.objectives.filter((item) => item.group === "expert").length,
    challenge: snapshot.objectives.filter((item) => item.group === "challenge").length,
  };
  return {
    seasonId: snapshot.seasonId,
    themeId: snapshot.themeId,
    themeName: snapshot.themeName,
    version: snapshot.version,
    startAt: window.startAt.toISOString(),
    endAt: window.endAt.toISOString(),
    primaryCategories: [...snapshot.primaryCategories],
    supportCategory: snapshot.supportCategory,
    objectiveCount: CODEX_RESEARCH_OBJECTIVE_COUNT,
    groupCounts,
    objectiveScore: CODEX_RESEARCH_OBJECTIVE_SCORE,
    diversityScore: CODEX_RESEARCH_DIVERSITY_SCORE,
    recordScore: CODEX_RESEARCH_RECORD_SCORE,
    schedulable: window.startAt.getTime() > now.getTime(),
  };
}

function validateSettlementPreviewCandidates(
  candidates: readonly CodexResearchSettlementPreviewCandidate[],
): void {
  const userIds = new Set<string>();
  for (const [index, candidate] of candidates.entries()) {
    const objectiveScore = candidate.score -
      candidate.diversityScore -
      candidate.recordScore;
    if (
      typeof candidate.userId !== "string" ||
      candidate.userId.trim().length === 0 ||
      candidate.userId !== candidate.userId.trim() ||
      userIds.has(candidate.userId) ||
      candidate.finalRank !== index + 1 ||
      !Number.isSafeInteger(candidate.score) ||
      candidate.score <= 0 ||
      candidate.score > CODEX_RESEARCH_MAX_SCORE ||
      !Number.isSafeInteger(candidate.objectiveCompletedCount) ||
      candidate.objectiveCompletedCount < 0 ||
      candidate.objectiveCompletedCount > CODEX_RESEARCH_OBJECTIVE_COUNT ||
      !Number.isSafeInteger(candidate.diversityScore) ||
      candidate.diversityScore < 0 ||
      candidate.diversityScore > CODEX_RESEARCH_DIVERSITY_SCORE ||
      !Number.isSafeInteger(candidate.recordScore) ||
      candidate.recordScore < 0 ||
      candidate.recordScore > CODEX_RESEARCH_RECORD_SCORE ||
      objectiveScore < 0 ||
      objectiveScore > CODEX_RESEARCH_OBJECTIVE_SCORE
    ) {
      throw new Error("codex research settlement preview candidates are invalid");
    }
    userIds.add(candidate.userId);
  }
}

export function buildCodexResearchSettlementPreview(
  seasonId: string,
  candidates: readonly CodexResearchSettlementPreviewCandidate[],
): CodexResearchSettlementPreview {
  kstCodexResearchSeasonWindow(seasonId);
  validateSettlementPreviewCandidates(candidates);

  const tierCounts = Object.fromEntries(
    CODEX_MASTERY_TROPHY_TIERS.map((tier) => [tier, 0]),
  ) as Record<CodexMasteryTrophyTier, number>;
  let untieredCount = 0;
  const rows = candidates.map((candidate): CodexResearchSettlementPreviewRow => {
    const tier = codexResearchTierFor(candidate.score, candidate.finalRank);
    if (tier) tierCounts[tier] += 1;
    else untieredCount += 1;
    return {
      userId: candidate.userId,
      rank: candidate.finalRank,
      score: candidate.score,
      tier,
    };
  });
  return {
    seasonId,
    participantCount: rows.length,
    tierCounts,
    untieredCount,
    top: rows.slice(0, 10),
  };
}

export function codexResearchConfirmation(
  operation: CodexResearchConfirmationOperation,
  seasonId: string,
): string {
  kstCodexResearchSeasonWindow(seasonId);
  const prefix = {
    schedule: "SCHEDULE",
    settle: "SETTLE",
    resettle: "RESETTLE",
    "award-trophies": "AWARD",
  }[operation];
  return `${prefix} ${seasonId}`;
}
