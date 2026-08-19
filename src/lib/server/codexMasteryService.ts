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
import {
  CODEX_MASTERY_POINT_UNITS,
  CODEX_MASTERY_STAGES,
} from "@/adventure/data/v2/codexMasteryTypes";
import {
  createDrizzleCodexMasteryStore,
  type CodexMasteryStore,
  type CodexMasterySummaryState,
} from "./codexMasteryRepository";
import type { DbTransactionExecutor } from "./savesKv";

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
};

export type CodexMasteryRecordResult =
  | { recorded: false; reason: "disabled" | "unchanged" }
  | {
      recorded: true;
      progress: CodexMasteryProgress;
      newStages: CodexMasteryStage[];
      newSealIds: string[];
      scoreDeltaMilli: number;
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

function assertLockedProgressMatchesDefinition(
  definition: CodexMasteryEntryDefinition,
  progress: CodexMasteryProgress,
): void {
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
  const expectedScoreMilli =
    (stagePointUnits + sealPointUnits) * definition.scoreWeightMilli;
  if (
    !Number.isSafeInteger(expectedScoreMilli) ||
    progress.scoreMilli !== expectedScoreMilli
  ) {
    throw new Error("codex mastery locked progress score is inconsistent");
  }
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
    assertLockedProgressMatchesDefinition(entry, locked.progress);
    const requestedMutation = mutationForLockedProgress(locked.progress);
    validateCallerMutation(requestedMutation, entry.seals);
    const mutation = settings.sealsEnabled
      ? requestedMutation
      : { ...requestedMutation, sealIds: [] };

    const transition = applyCodexMasteryMutation(entry, locked.progress, mutation, now);

    if (unchangedProgress(locked.progress, transition.next)) {
      return { recorded: false, reason: "unchanged" };
    }

    const summary = nextSummaryFromTransition(
      locked.summary,
      input.category,
      transition,
      now,
    );
    await store.save({
      userId: input.userId,
      summary,
      progress: transition.next,
    }, now);
    return {
      recorded: true,
      progress: transition.next,
      newStages: transition.newStages,
      newSealIds: transition.newSealIds,
      scoreDeltaMilli: transition.scoreDeltaMilli,
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

export async function recordCodexMastery(
  executor: DbTransactionExecutor,
  catalog: CodexMasteryCatalog,
  input: CodexMasteryRecordInput,
  settings: CodexMasteryRecordingSettings,
  now = new Date(),
): Promise<CodexMasteryRecordResult> {
  const store = createDrizzleCodexMasteryStore(executor);
  return createCodexMasteryRecorder(store, catalog).record(input, settings, now);
}

export async function syncCodexMasteryTarget(
  executor: DbTransactionExecutor,
  catalog: CodexMasteryCatalog,
  input: CodexMasteryTargetInput,
  settings: CodexMasteryRecordingSettings,
  now = new Date(),
): Promise<CodexMasteryRecordResult> {
  const store = createDrizzleCodexMasteryStore(executor);
  return createCodexMasteryRecorder(store, catalog).syncTarget(input, settings, now);
}
