import {
  applyCodexMasteryMutation,
} from "@/adventure/data/v2/codexMastery";
import type { CodexMasteryCatalog } from "@/adventure/data/v2/codexMasteryCatalog";
import type {
  CodexMasteryCategory,
  CodexMasteryCountStage,
  CodexMasteryEntryDefinition,
  CodexMasteryMutation,
  CodexMasteryProgress,
  CodexMasteryStage,
} from "@/adventure/data/v2/codexMasteryTypes";
import type { CodexMasteryTrophyPromotion } from "@/adventure/data/v2/codexMasteryTrophies";
import {
  CODEX_MASTERY_POINT_UNITS,
  CODEX_MASTERY_STAGES,
} from "@/adventure/data/v2/codexMasteryTypes";
import {
  createDrizzleCodexMasteryStore,
  createDrizzleCodexMasteryBatchStore,
  type CodexMasteryBatchStore,
  type CodexMasteryStore,
  type CodexMasterySummaryState,
} from "./codexMasteryRepository";
import type { DbTransactionExecutor } from "./savesKv";
import { reconcileCodexMasteryTrophies } from "./codexMasteryTrophyRepository";

export const CODEX_MASTERY_SOURCES = {
  equipment: ["equipment.drop", "equipment.craft", "codex.backfill.v1"],
  fish: ["fishing.catch", "codex.backfill.v1"],
  monster: ["hunt.victory", "codex.backfill.v1"],
  cooking: ["cooking.complete", "codex.backfill.v1"],
  life: ["life.complete", "codex.backfill.v1"],
  job: [
    "job.victory",
    "job.activity",
    "job.training",
    "job.consumable",
    "codex.backfill.v1",
  ],
} as const satisfies Record<CodexMasteryCategory, readonly string[]>;

export type CodexMasterySourceForCategory<
  Category extends CodexMasteryCategory,
> = (typeof CODEX_MASTERY_SOURCES)[Category][number];

type CodexMasteryRecordInputForCategory<
  Category extends CodexMasteryCategory,
> = {
  userId: string;
  category: Category;
  entryId: string;
  mutation: CodexMasteryMutation;
  source: CodexMasterySourceForCategory<Category>;
};

export type CodexMasteryRecordInput = {
  [Category in CodexMasteryCategory]: CodexMasteryRecordInputForCategory<Category>;
}[CodexMasteryCategory];

type CodexMasteryTargetInputForCategory<
  Category extends CodexMasteryCategory,
> = {
  userId: string;
  category: Category;
  entryId: string;
  target: {
    count: number;
    discovered?: boolean;
    bestValue?: number;
    sealIds?: readonly string[];
  };
  source: CodexMasterySourceForCategory<Category>;
};

export type CodexMasteryTargetInput = {
  [Category in CodexMasteryCategory]: CodexMasteryTargetInputForCategory<Category>;
}[CodexMasteryCategory];

export type CodexMasteryRecordingSettings = {
  recordingEnabled: boolean;
  sealsEnabled: boolean;
  trophiesEnabled: boolean;
};

export type CodexMasteryRecordResult =
  | { recorded: false; reason: "disabled" | "unchanged" }
  | {
      recorded: true;
      progress: CodexMasteryProgress;
      newStages: CodexMasteryStage[];
      newSealIds: string[];
      scoreDeltaMilli: number;
      newTrophyPromotions: CodexMasteryTrophyPromotion[];
    };

export class CodexMasteryRecordError extends Error {
  constructor(
    readonly code: "unknown_entry" | "invalid_source" | "invalid_mutation",
    message: string,
  ) {
    super(message);
    this.name = "CodexMasteryRecordError";
  }
}

function isCodexMasterySourceForCategory(
  category: CodexMasteryCategory,
  source: unknown,
): source is CodexMasterySourceForCategory<typeof category> {
  return typeof source === "string" &&
    (CODEX_MASTERY_SOURCES[category] as readonly string[]).includes(source);
}

function invalidMutation(message: string): CodexMasteryRecordError {
  return new CodexMasteryRecordError("invalid_mutation", message);
}

function validateCallerMutation(
  mutation: CodexMasteryMutation,
  seals: Readonly<Record<string, unknown>>,
): void {
  if (!mutation || typeof mutation !== "object") {
    throw invalidMutation("mutation is required");
  }
  if (!Number.isSafeInteger(mutation.amount) || mutation.amount < 0) {
    throw invalidMutation("amount must be a non-negative safe integer");
  }
  if (mutation.discovered !== undefined && typeof mutation.discovered !== "boolean") {
    throw invalidMutation("discovered must be a boolean");
  }
  if (
    mutation.bestValue !== undefined &&
    (!Number.isFinite(mutation.bestValue) || mutation.bestValue < 0)
  ) {
    throw invalidMutation("bestValue must be finite and non-negative");
  }
  if (mutation.sealIds !== undefined && !Array.isArray(mutation.sealIds)) {
    throw invalidMutation("sealIds must be an array");
  }
  for (const sealId of mutation.sealIds ?? []) {
    if (
      typeof sealId !== "string" ||
      sealId.trim().length === 0 ||
      !Object.hasOwn(seals, sealId)
    ) {
      throw invalidMutation(`unknown seal: ${String(sealId)}`);
    }
  }
}

function unchangedProgress(
  previous: CodexMasteryProgress,
  next: CodexMasteryProgress,
): boolean {
  if (
    previous.category !== next.category ||
    previous.entryId !== next.entryId ||
    previous.count !== next.count ||
    previous.bestValue !== next.bestValue ||
    previous.currentTier !== next.currentTier ||
    previous.scoreMilli !== next.scoreMilli ||
    previous.sealIds.length !== next.sealIds.length
  ) {
    return false;
  }
  if (previous.sealIds.some((sealId, index) => next.sealIds[index] !== sealId)) {
    return false;
  }
  const previousTimestamps = previous.tierAchievedAt;
  const nextTimestamps = next.tierAchievedAt;
  const stageKeys = new Set([
    ...Object.keys(previousTimestamps),
    ...Object.keys(nextTimestamps),
  ]);
  return [...stageKeys].every((stage) =>
    previousTimestamps[stage as CodexMasteryStage] ===
      nextTimestamps[stage as CodexMasteryStage],
  );
}

const COUNT_STAGES: readonly CodexMasteryCountStage[] = [
  "bronze",
  "silver",
  "gold",
  "platinum",
  "diamond",
  "legendary",
];

type NormalizedLockedProgress = {
  progress: CodexMasteryProgress;
  scoreCorrectionMilli: number;
};

function lockedProgressPointUnits(
  definition: CodexMasteryEntryDefinition,
  progress: CodexMasteryProgress,
): number {
  const currentTierIndex = progress.currentTier === "none"
    ? -1
    : CODEX_MASTERY_STAGES.indexOf(progress.currentTier);
  const stagePointUnits = CODEX_MASTERY_STAGES.reduce(
    (sum, stage, index) => index <= currentTierIndex
      ? sum + CODEX_MASTERY_POINT_UNITS[stage]
      : sum,
    0,
  );
  const sealPointUnits = progress.sealIds.reduce(
    (sum, sealId) => sum + definition.seals[sealId].pointUnits,
    0,
  );
  return stagePointUnits + sealPointUnits;
}

function normalizeLockedProgressScore(
  definition: CodexMasteryEntryDefinition,
  progress: CodexMasteryProgress,
): NormalizedLockedProgress {
  if (
    progress.category !== definition.category ||
    progress.entryId !== definition.entryId
  ) {
    throw new Error("progress does not match definition");
  }
  if (
    !Array.isArray(progress.sealIds) ||
    new Set(progress.sealIds).size !== progress.sealIds.length ||
    progress.sealIds.some((sealId) =>
      typeof sealId !== "string" ||
      sealId.trim().length === 0 ||
      !Object.hasOwn(definition.seals, sealId)
    )
  ) {
    throw new Error("codex mastery locked progress seals are invalid");
  }

  const countTier = COUNT_STAGES.filter((stage) =>
    progress.count >= definition.thresholds[stage]
  ).at(-1);
  if (
    (countTier !== undefined && progress.currentTier !== countTier) ||
    (countTier === undefined && progress.count > 0 &&
      progress.currentTier !== "discovered") ||
    (countTier === undefined && progress.count === 0 &&
      progress.currentTier !== "none" && progress.currentTier !== "discovered")
  ) {
    throw new Error("codex mastery locked progress tier/count is inconsistent");
  }

  const pointUnits = lockedProgressPointUnits(definition, progress);
  const expectedScoreMilli = pointUnits * definition.scoreWeightMilli;
  if (!Number.isSafeInteger(expectedScoreMilli)) {
    throw new Error("codex mastery locked progress score is inconsistent");
  }
  if (progress.scoreMilli === expectedScoreMilli) {
    return { progress, scoreCorrectionMilli: 0 };
  }

  const compatibleWeight = definition.compatibleScoreWeightsMilli?.find((weight) => {
    const compatibleScoreMilli = pointUnits * weight;
    return Number.isSafeInteger(compatibleScoreMilli) &&
      progress.scoreMilli === compatibleScoreMilli;
  });
  if (compatibleWeight === undefined) {
    throw new Error("codex mastery locked progress score is inconsistent");
  }

  const scoreCorrectionMilli = expectedScoreMilli - progress.scoreMilli;
  if (!Number.isSafeInteger(scoreCorrectionMilli) || scoreCorrectionMilli < 0) {
    throw new Error("codex mastery locked progress score is inconsistent");
  }
  return {
    progress: { ...progress, scoreMilli: expectedScoreMilli },
    scoreCorrectionMilli,
  };
}

function safeAdd(value: number, delta: number): number {
  if (!Number.isSafeInteger(value) || !Number.isSafeInteger(delta)) {
    throw invalidMutation("summary values must be safe integers");
  }
  const next = value + delta;
  if (!Number.isSafeInteger(next)) {
    throw invalidMutation("summary values would overflow a safe integer");
  }
  return next;
}

function nextSummaryFromTransition(
  summary: CodexMasterySummaryState,
  category: CodexMasteryCategory,
  transition: ReturnType<typeof applyCodexMasteryMutation>,
  now: Date,
): CodexMasterySummaryState {
  const nextSummary: CodexMasterySummaryState = {
    ...summary,
    categoryScoreMilli: { ...summary.categoryScoreMilli },
    stageCounts: { ...summary.stageCounts },
    scoreReachedAt: summary.scoreReachedAt
      ? new Date(summary.scoreReachedAt.getTime())
      : null,
    categoryScoreReachedAt: Object.fromEntries(
      Object.entries(summary.categoryScoreReachedAt).map(([key, value]) => [
        key,
        value ? new Date(value.getTime()) : null,
      ]),
    ) as CodexMasterySummaryState["categoryScoreReachedAt"],
  };
  for (const stage of transition.newStages) {
    if (stage !== "discovered") {
      nextSummary.stageCounts[stage] = safeAdd(nextSummary.stageCounts[stage], 1);
    }
  }
  nextSummary.sealCount = safeAdd(nextSummary.sealCount, transition.newSealIds.length);
  const previousCategoryScoreMilli = nextSummary.categoryScoreMilli[category];
  nextSummary.totalScoreMilli = safeAdd(
    nextSummary.totalScoreMilli,
    transition.scoreDeltaMilli,
  );
  nextSummary.categoryScoreMilli[category] = safeAdd(
    previousCategoryScoreMilli,
    transition.scoreDeltaMilli,
  );
  if (transition.scoreDeltaMilli > 0) {
    if (
      previousCategoryScoreMilli === 0 &&
      nextSummary.categoryScoreMilli[category] > 0
    ) {
      nextSummary.scoredCategoryCount = safeAdd(
        nextSummary.scoredCategoryCount,
        1,
      );
    }
    const laterReachTime = (current: Date | null): Date =>
      current && current.getTime() > now.getTime()
        ? new Date(current.getTime())
        : new Date(now.getTime());
    nextSummary.scoreReachedAt = laterReachTime(nextSummary.scoreReachedAt);
    nextSummary.categoryScoreReachedAt[category] = laterReachTime(
      nextSummary.categoryScoreReachedAt[category],
    );
  }
  return nextSummary;
}

function normalizeSummaryScore(
  summary: CodexMasterySummaryState,
  category: CodexMasteryCategory,
  scoreCorrectionMilli: number,
): CodexMasterySummaryState {
  if (scoreCorrectionMilli === 0) return summary;
  const totalScoreMilli = safeAdd(summary.totalScoreMilli, scoreCorrectionMilli);
  const categoryScoreMilli = safeAdd(
    summary.categoryScoreMilli[category],
    scoreCorrectionMilli,
  );
  if (totalScoreMilli < 0 || categoryScoreMilli < 0) {
    throw new Error("codex mastery summary score correction is invalid");
  }
  return {
    ...summary,
    totalScoreMilli,
    categoryScoreMilli: {
      ...summary.categoryScoreMilli,
      [category]: categoryScoreMilli,
    },
  };
}

export function createCodexMasteryRecorder(
  store: CodexMasteryStore,
  catalog: CodexMasteryCatalog,
): {
  record(
    input: CodexMasteryRecordInput,
    settings: CodexMasteryRecordingSettings,
    now?: Date,
  ): Promise<CodexMasteryRecordResult>;
  syncTarget(
    input: CodexMasteryTargetInput,
    settings: CodexMasteryRecordingSettings,
    now?: Date,
  ): Promise<CodexMasteryRecordResult>;
} {
  const applyLockedMutation = async (
    input: Pick<CodexMasteryRecordInput, "userId" | "category" | "entryId" | "source">,
    mutationForLockedProgress: (progress: CodexMasteryProgress) => CodexMasteryMutation,
    settings: CodexMasteryRecordingSettings,
    now: Date,
  ): Promise<CodexMasteryRecordResult> => {
    if (!settings.recordingEnabled) {
      return { recorded: false, reason: "disabled" };
    }

    const entry = catalog.get(input.category, input.entryId);
    if (!entry) {
      throw new CodexMasteryRecordError("unknown_entry", "codex mastery entry is unknown");
    }
    if (!isCodexMasterySourceForCategory(input.category, input.source)) {
      throw new CodexMasteryRecordError("invalid_source", "source must be server-owned");
    }

    const locked = await store.lock({
      userId: input.userId,
      category: input.category,
      entryId: input.entryId,
    }, now);
    const normalized = normalizeLockedProgressScore(entry, locked.progress);
    const requestedMutation = mutationForLockedProgress(normalized.progress);
    validateCallerMutation(requestedMutation, entry.seals);
    const mutation = settings.sealsEnabled
      ? requestedMutation
      : { ...requestedMutation, sealIds: [] };

    const transition = applyCodexMasteryMutation(
      entry,
      normalized.progress,
      mutation,
      now,
    );

    if (
      normalized.scoreCorrectionMilli === 0 &&
      unchangedProgress(locked.progress, transition.next)
    ) {
      return { recorded: false, reason: "unchanged" };
    }

    const normalizedSummary = normalizeSummaryScore(
      locked.summary,
      input.category,
      normalized.scoreCorrectionMilli,
    );
    const summary = nextSummaryFromTransition(
      normalizedSummary,
      input.category,
      transition,
      now,
    );
    await store.save({
      userId: input.userId,
      summary,
      progress: transition.next,
    }, now);
    let newTrophyPromotions: CodexMasteryTrophyPromotion[] = [];
    const crossedCountTier = transition.newStages.some(
      (stage) => stage !== "discovered",
    );
    if (settings.trophiesEnabled && crossedCountTier) {
      if (!store.reconcileTrophies) {
        throw new Error("codex mastery trophy reconciliation is unavailable");
      }
      const reconciled = await store.reconcileTrophies(input.userId, now);
      newTrophyPromotions = reconciled.promotions;
    }
    return {
      recorded: true,
      progress: transition.next,
      newStages: transition.newStages,
      newSealIds: transition.newSealIds,
      scoreDeltaMilli: transition.scoreDeltaMilli,
      newTrophyPromotions,
    };
  };

  return {
    async record(input, settings, now = new Date()) {
      if (!settings.recordingEnabled) {
        return { recorded: false, reason: "disabled" };
      }
      const entry = catalog.get(input.category, input.entryId);
      if (!entry) {
        throw new CodexMasteryRecordError("unknown_entry", "codex mastery entry is unknown");
      }
      if (!isCodexMasterySourceForCategory(input.category, input.source)) {
        throw new CodexMasteryRecordError("invalid_source", "source must be server-owned");
      }
      validateCallerMutation(input.mutation, entry.seals);
      return applyLockedMutation(input, () => input.mutation, settings, now);
    },
    async syncTarget(input, settings, now = new Date()) {
      if (!settings.recordingEnabled) {
        return { recorded: false, reason: "disabled" };
      }
      if (!input.target || typeof input.target !== "object") {
        throw invalidMutation("target is required");
      }
      if (!Number.isSafeInteger(input.target.count) || input.target.count < 0) {
        throw invalidMutation("target count must be a non-negative safe integer");
      }
      const targetMutation: CodexMasteryMutation = {
        amount: 0,
        discovered: input.target.discovered,
        bestValue: input.target.bestValue,
        sealIds: input.target.sealIds,
      };
      const entry = catalog.get(input.category, input.entryId);
      if (!entry) {
        throw new CodexMasteryRecordError("unknown_entry", "codex mastery entry is unknown");
      }
      if (!isCodexMasterySourceForCategory(input.category, input.source)) {
        throw new CodexMasteryRecordError("invalid_source", "source must be server-owned");
      }
      validateCallerMutation(targetMutation, entry.seals);
      return applyLockedMutation(input, (progress) => ({
        ...targetMutation,
        amount: Math.max(0, input.target.count - progress.count),
      }), settings, now);
    },
  };
}

function masteryProgressKey(
  category: CodexMasteryCategory,
  entryId: string,
): string {
  return `${category}\u0000${entryId}`;
}

export function createCodexMasteryBatchRecorder(
  store: CodexMasteryBatchStore,
  catalog: CodexMasteryCatalog,
): {
  recordBatch(
    inputs: readonly CodexMasteryRecordInput[],
    settings: CodexMasteryRecordingSettings,
    now?: Date,
  ): Promise<CodexMasteryRecordResult[]>;
} {
  return {
    async recordBatch(inputs, settings, now = new Date()) {
      if (!settings.recordingEnabled) {
        return inputs.map(() => ({ recorded: false, reason: "disabled" }));
      }
      if (inputs.length === 0) return [];

      const userId = inputs[0].userId;
      const entriesByKey = new Map<string, {
        category: CodexMasteryCategory;
        entryId: string;
      }>();
      for (const input of inputs) {
        if (input.userId !== userId) {
          throw invalidMutation("batch inputs must belong to one user");
        }
        const entry = catalog.get(input.category, input.entryId);
        if (!entry) {
          throw new CodexMasteryRecordError(
            "unknown_entry",
            "codex mastery entry is unknown",
          );
        }
        if (!isCodexMasterySourceForCategory(input.category, input.source)) {
          throw new CodexMasteryRecordError(
            "invalid_source",
            "source must be server-owned",
          );
        }
        validateCallerMutation(input.mutation, entry.seals);
        entriesByKey.set(masteryProgressKey(input.category, input.entryId), {
          category: input.category,
          entryId: input.entryId,
        });
      }

      const entries = [...entriesByKey.values()].sort((left, right) =>
        left.category.localeCompare(right.category) ||
        left.entryId.localeCompare(right.entryId)
      );
      const locked = await store.lockBatch({ userId, entries }, now);
      const progressByKey = new Map(
        locked.progress.map((progress) => [
          masteryProgressKey(progress.category, progress.entryId),
          progress,
        ]),
      );
      if (progressByKey.size !== entries.length) {
        throw new Error("codex mastery batch progress rows do not match entries");
      }

      let summary = locked.summary;
      const dirtyKeys = new Set<string>();
      const countTierResultIndexes: number[] = [];
      const results: CodexMasteryRecordResult[] = [];
      for (const input of inputs) {
        const key = masteryProgressKey(input.category, input.entryId);
        const progress = progressByKey.get(key);
        const entry = catalog.get(input.category, input.entryId);
        if (!progress || !entry) {
          throw new Error("codex mastery batch locked progress is missing");
        }
        const normalized = normalizeLockedProgressScore(entry, progress);
        const mutation = settings.sealsEnabled
          ? input.mutation
          : { ...input.mutation, sealIds: [] };
        const transition = applyCodexMasteryMutation(
          entry,
          normalized.progress,
          mutation,
          now,
        );
        if (
          normalized.scoreCorrectionMilli === 0 &&
          unchangedProgress(progress, transition.next)
        ) {
          results.push({ recorded: false, reason: "unchanged" });
          continue;
        }

        summary = normalizeSummaryScore(
          summary,
          input.category,
          normalized.scoreCorrectionMilli,
        );
        summary = nextSummaryFromTransition(
          summary,
          input.category,
          transition,
          now,
        );
        progressByKey.set(key, transition.next);
        dirtyKeys.add(key);
        const resultIndex = results.length;
        if (transition.newStages.some((stage) => stage !== "discovered")) {
          countTierResultIndexes.push(resultIndex);
        }
        results.push({
          recorded: true,
          progress: transition.next,
          newStages: transition.newStages,
          newSealIds: transition.newSealIds,
          scoreDeltaMilli: transition.scoreDeltaMilli,
          newTrophyPromotions: [],
        });
      }

      if (dirtyKeys.size > 0) {
        const progress = [...dirtyKeys]
          .map((key) => progressByKey.get(key))
          .filter((value): value is CodexMasteryProgress => value !== undefined)
          .sort((left, right) =>
            left.category.localeCompare(right.category) ||
            left.entryId.localeCompare(right.entryId)
          );
        await store.saveBatch({ userId, summary, progress }, now);
      }

      if (settings.trophiesEnabled && countTierResultIndexes.length > 0) {
        if (!store.reconcileTrophies) {
          throw new Error("codex mastery trophy reconciliation is unavailable");
        }
        const reconciled = await store.reconcileTrophies(userId, now);
        const resultIndex = countTierResultIndexes.at(-1);
        if (resultIndex !== undefined) {
          const result = results[resultIndex];
          if (result.recorded) {
            results[resultIndex] = {
              ...result,
              newTrophyPromotions: reconciled.promotions,
            };
          }
        }
      }
      return results;
    },
  };
}

export async function recordCodexMastery(
  executor: DbTransactionExecutor,
  catalog: CodexMasteryCatalog,
  input: CodexMasteryRecordInput,
  settings: CodexMasteryRecordingSettings,
  now = new Date(),
): Promise<CodexMasteryRecordResult> {
  const store: CodexMasteryStore = {
    ...createDrizzleCodexMasteryStore(executor),
    reconcileTrophies: (userId, at) =>
      reconcileCodexMasteryTrophies(executor, userId, catalog, at),
  };
  return createCodexMasteryRecorder(store, catalog).record(input, settings, now);
}

export async function recordCodexMasteryBatch(
  executor: DbTransactionExecutor,
  catalog: CodexMasteryCatalog,
  inputs: readonly CodexMasteryRecordInput[],
  settings: CodexMasteryRecordingSettings,
  now = new Date(),
): Promise<CodexMasteryRecordResult[]> {
  const store: CodexMasteryBatchStore = {
    ...createDrizzleCodexMasteryBatchStore(executor),
    reconcileTrophies: (userId, at) =>
      reconcileCodexMasteryTrophies(executor, userId, catalog, at),
  };
  return createCodexMasteryBatchRecorder(store, catalog)
    .recordBatch(inputs, settings, now);
}

export async function syncCodexMasteryTarget(
  executor: DbTransactionExecutor,
  catalog: CodexMasteryCatalog,
  input: CodexMasteryTargetInput,
  settings: CodexMasteryRecordingSettings,
  now = new Date(),
): Promise<CodexMasteryRecordResult> {
  const store: CodexMasteryStore = {
    ...createDrizzleCodexMasteryStore(executor),
    reconcileTrophies: (userId, at) =>
      reconcileCodexMasteryTrophies(executor, userId, catalog, at),
  };
  return createCodexMasteryRecorder(store, catalog).syncTarget(input, settings, now);
}
