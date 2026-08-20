import type { CodexMasteryCatalog } from "./codexMasteryCatalog";
import {
  CODEX_MASTERY_CATEGORIES,
  CODEX_MASTERY_STAGES,
  type CodexMasteryCategory,
  type CodexMasteryProgress,
  type CodexMasteryStage,
  type CodexMasteryTier,
} from "./codexMasteryTypes";

export const CODEX_MASTERY_TROPHY_TIERS = [
  "bronze",
  "silver",
  "gold",
  "platinum",
  "diamond",
  "legendary",
] as const;

export type CodexMasteryTrophyTier =
  (typeof CODEX_MASTERY_TROPHY_TIERS)[number];
export type CodexMasteryTrophyKind = "mastery_category" | "mastery_overall";
export type CodexMasteryTrophyId =
  | `mastery:${CodexMasteryCategory}`
  | "mastery:overall";

export type CodexMasteryTrophyDefinition = {
  id: CodexMasteryTrophyId;
  kind: CodexMasteryTrophyKind;
  category: CodexMasteryCategory | "overall";
  title: string;
};

export type CodexMasteryTrophyHistory = {
  trophyId: CodexMasteryTrophyId;
  kind: CodexMasteryTrophyKind;
  currentTier: CodexMasteryTrophyTier;
  tierAchievedAt: Partial<Record<CodexMasteryTrophyTier, string>>;
  catalogVersion: number;
};

export type CodexMasteryTrophyProgress = {
  tier: CodexMasteryTrophyTier;
  current: number;
  required: number;
};

export type CodexMasteryTrophyEvaluation = {
  trophyId: CodexMasteryTrophyId;
  kind: CodexMasteryTrophyKind;
  category: CodexMasteryCategory | "overall";
  title: string;
  currentTier: CodexMasteryTrophyTier | null;
  tierAchievedAt: Partial<Record<CodexMasteryTrophyTier, string>>;
  catalogVersion: number;
  nextProgress: CodexMasteryTrophyProgress | null;
};

export type CodexMasteryTrophyPromotion = {
  trophyId: CodexMasteryTrophyId;
  tier: CodexMasteryTrophyTier;
  achievedAt: string;
};

const CATEGORY_TITLES: Record<CodexMasteryCategory, string> = {
  equipment: "무구의 기록자",
  fish: "만경의 어탁",
  monster: "대륙 생태 표본",
  cooking: "왕실의 조리도구",
  life: "대지의 관찰일지",
  job: "천직의 문장",
};

export const CODEX_MASTERY_TROPHY_DEFINITIONS:
readonly CodexMasteryTrophyDefinition[] = Object.freeze([
  ...CODEX_MASTERY_CATEGORIES.map((category) => Object.freeze({
    id: `mastery:${category}` as const,
    kind: "mastery_category" as const,
    category,
    title: CATEGORY_TITLES[category],
  })),
  Object.freeze({
    id: "mastery:overall" as const,
    kind: "mastery_overall" as const,
    category: "overall" as const,
    title: "모험왕의 대서",
  }),
]);

const TROPHY_BY_ID = new Map(
  CODEX_MASTERY_TROPHY_DEFINITIONS.map((definition) => [definition.id, definition]),
);

export function codexMasteryTrophyDefinition(
  trophyId: string,
): CodexMasteryTrophyDefinition | null {
  return TROPHY_BY_ID.get(trophyId as CodexMasteryTrophyId) ?? null;
}

function trophyTierIndex(tier: CodexMasteryTrophyTier | null): number {
  return tier === null ? -1 : CODEX_MASTERY_TROPHY_TIERS.indexOf(tier);
}

function masteryTierIndex(tier: CodexMasteryTier): number {
  return tier === "none" ? -1 : CODEX_MASTERY_STAGES.indexOf(tier);
}

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function latestTimestamp(values: readonly string[], fallback: string): string {
  if (values.length === 0) return fallback;
  return values.reduce((latest, value) =>
    Date.parse(value) > Date.parse(latest) ? value : latest
  );
}

function achievementTimeForCount(
  rows: readonly CodexMasteryProgress[],
  stage: CodexMasteryStage,
  required: number,
  fallback: string,
): string | null {
  const times = rows
    .filter((row) => masteryTierIndex(row.currentTier) >= masteryTierIndex(stage))
    .map((row) => row.tierAchievedAt[stage])
    .map((value) => validTimestamp(value) ? value : fallback)
    .sort((left, right) => Date.parse(left) - Date.parse(right));
  return times.length >= required ? times[required - 1] : null;
}

function requiredForTier(
  tier: CodexMasteryTrophyTier,
  total: number,
): number {
  if (tier === "bronze" || tier === "platinum") return Math.ceil(total * 0.25);
  if (tier === "silver" || tier === "diamond") return Math.ceil(total * 0.5);
  return total;
}

function countForTier(
  rows: readonly CodexMasteryProgress[],
  tier: CodexMasteryTrophyTier,
): number {
  return rows.filter((row) =>
    masteryTierIndex(row.currentTier) >= masteryTierIndex(tier)
  ).length;
}

function categoryCandidates(
  rows: readonly CodexMasteryProgress[],
  total: number,
  fallback: string,
): Partial<Record<CodexMasteryTrophyTier, string>> {
  if (total <= 0) return {};
  const result: Partial<Record<CodexMasteryTrophyTier, string>> = {};
  for (const tier of CODEX_MASTERY_TROPHY_TIERS) {
    const required = requiredForTier(tier, total);
    const time = achievementTimeForCount(rows, tier, required, fallback);
    const goldRequired = tier === "platinum" || tier === "diamond";
    if (!time || (goldRequired && !result.gold)) continue;
    result[tier] = goldRequired
      ? latestTimestamp([time, result.gold as string], fallback)
      : time;
  }
  return result;
}

function normalizedPriorHistory(
  history: readonly CodexMasteryTrophyHistory[],
): Map<CodexMasteryTrophyId, CodexMasteryTrophyHistory> {
  const result = new Map<CodexMasteryTrophyId, CodexMasteryTrophyHistory>();
  for (const item of history) {
    if (!codexMasteryTrophyDefinition(item.trophyId)) continue;
    result.set(item.trophyId, {
      ...item,
      tierAchievedAt: { ...item.tierAchievedAt },
    });
  }
  return result;
}

function evaluatedFamily(
  definition: CodexMasteryTrophyDefinition,
  candidates: Partial<Record<CodexMasteryTrophyTier, string>>,
  previous: CodexMasteryTrophyHistory | undefined,
  nextProgress: (currentTier: CodexMasteryTrophyTier | null) => CodexMasteryTrophyProgress | null,
  catalogVersion: number,
): { trophy: CodexMasteryTrophyEvaluation; promotions: CodexMasteryTrophyPromotion[] } {
  const candidateTier = CODEX_MASTERY_TROPHY_TIERS.filter((tier) => candidates[tier]).at(-1) ?? null;
  const previousTier = previous?.currentTier ?? null;
  const currentTier = trophyTierIndex(previousTier) >= trophyTierIndex(candidateTier)
    ? previousTier
    : candidateTier;
  const tierAchievedAt = { ...(previous?.tierAchievedAt ?? {}) };
  const promotions: CodexMasteryTrophyPromotion[] = [];
  for (const tier of CODEX_MASTERY_TROPHY_TIERS) {
    if (
      trophyTierIndex(tier) > trophyTierIndex(previousTier) &&
      trophyTierIndex(tier) <= trophyTierIndex(candidateTier)
    ) {
      const achievedAt = candidates[tier];
      if (!achievedAt) continue;
      tierAchievedAt[tier] = achievedAt;
      promotions.push({ trophyId: definition.id, tier, achievedAt });
    }
  }
  return {
    trophy: {
      trophyId: definition.id,
      kind: definition.kind,
      category: definition.category,
      title: definition.title,
      currentTier,
      tierAchievedAt,
      catalogVersion,
      nextProgress: nextProgress(currentTier),
    },
    promotions,
  };
}

export function evaluateCodexMasteryTrophies({
  catalog,
  progressRows,
  history,
  now,
  catalogVersion = 1,
}: {
  catalog: CodexMasteryCatalog;
  progressRows: readonly CodexMasteryProgress[];
  history: readonly CodexMasteryTrophyHistory[];
  now: Date;
  catalogVersion?: number;
}): {
  trophies: CodexMasteryTrophyEvaluation[];
  promotions: CodexMasteryTrophyPromotion[];
} {
  const fallback = now.toISOString();
  const previousById = normalizedPriorHistory(history);
  const trophies: CodexMasteryTrophyEvaluation[] = [];
  const promotions: CodexMasteryTrophyPromotion[] = [];

  for (const category of CODEX_MASTERY_CATEGORIES) {
    const definition = TROPHY_BY_ID.get(`mastery:${category}` as CodexMasteryTrophyId);
    if (!definition) throw new Error(`missing trophy definition: ${category}`);
    const catalogEntries = catalog.list(category);
    const entryIds = new Set(catalogEntries.map((entry) => entry.entryId));
    const rows = progressRows.filter((row) =>
      row.category === category && entryIds.has(row.entryId)
    );
    const candidates = categoryCandidates(rows, catalogEntries.length, fallback);
    const evaluated = evaluatedFamily(
      definition,
      candidates,
      previousById.get(definition.id),
      (currentTier) => {
        const nextTier = CODEX_MASTERY_TROPHY_TIERS[trophyTierIndex(currentTier) + 1];
        if (!nextTier) return null;
        return {
          tier: nextTier,
          current: countForTier(rows, nextTier),
          required: requiredForTier(nextTier, catalogEntries.length),
        };
      },
      catalogVersion,
    );
    trophies.push(evaluated.trophy);
    promotions.push(...evaluated.promotions);
  }

  const categoryById = new Map(trophies.map((trophy) => [trophy.trophyId, trophy]));
  const overallDefinition = TROPHY_BY_ID.get("mastery:overall");
  if (!overallDefinition) throw new Error("missing overall trophy definition");
  const overallCandidates: Partial<Record<CodexMasteryTrophyTier, string>> = {};
  for (const tier of CODEX_MASTERY_TROPHY_TIERS) {
    const categoryTimes = CODEX_MASTERY_CATEGORIES.map((category) =>
      categoryById.get(`mastery:${category}`)?.tierAchievedAt[tier]
    );
    if (categoryTimes.every(validTimestamp)) {
      overallCandidates[tier] = latestTimestamp(categoryTimes, fallback);
    }
  }
  const overall = evaluatedFamily(
    overallDefinition,
    overallCandidates,
    previousById.get("mastery:overall"),
    (currentTier) => {
      const nextTier = CODEX_MASTERY_TROPHY_TIERS[trophyTierIndex(currentTier) + 1];
      if (!nextTier) return null;
      return {
        tier: nextTier,
        current: CODEX_MASTERY_CATEGORIES.filter((category) => {
          const trophy = categoryById.get(`mastery:${category}`);
          return trophyTierIndex(trophy?.currentTier ?? null) >= trophyTierIndex(nextTier);
        }).length,
        required: CODEX_MASTERY_CATEGORIES.length,
      };
    },
    catalogVersion,
  );
  trophies.push(overall.trophy);
  promotions.push(...overall.promotions);

  return { trophies, promotions };
}
