import {
  applyCodexMasteryMutation,
} from "@/adventure/data/v2/codexMastery";
import type { CodexMasteryCatalog } from "@/adventure/data/v2/codexMasteryCatalog";
import type {
  CodexMasteryCategory,
  CodexMasteryMutation,
  CodexMasteryProgress,
  CodexMasteryStage,
} from "@/adventure/data/v2/codexMasteryTypes";
import {
  createDrizzleCodexMasteryStore,
  type CodexMasteryStore,
  type CodexMasterySummaryState,
} from "./codexMasteryRepository";
import type { DbExecutor } from "./savesKv";

export type CodexMasteryRecordInput = {
  userId: string;
  category: CodexMasteryCategory;
  entryId: string;
  mutation: CodexMasteryMutation;
  source: string;
};

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

const SERVER_SOURCE_ID = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/;

function invalidMutation(message: string): CodexMasteryRecordError {
  return new CodexMasteryRecordError("invalid_mutation", message);
}

function validateRequestedSeals(
  mutation: CodexMasteryMutation,
  seals: Readonly<Record<string, unknown>>,
): void {
  if (!mutation || typeof mutation !== "object") {
    throw invalidMutation("mutation is required");
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
  };
  for (const stage of transition.newStages) {
    if (stage !== "discovered") {
      nextSummary.stageCounts[stage] = safeAdd(nextSummary.stageCounts[stage], 1);
    }
  }
  nextSummary.sealCount = safeAdd(nextSummary.sealCount, transition.newSealIds.length);
  nextSummary.totalScoreMilli = safeAdd(
    nextSummary.totalScoreMilli,
    transition.scoreDeltaMilli,
  );
  nextSummary.categoryScoreMilli[category] = safeAdd(
    nextSummary.categoryScoreMilli[category],
    transition.scoreDeltaMilli,
  );
  if (transition.scoreDeltaMilli > 0) nextSummary.scoreReachedAt = now;
  return nextSummary;
}

export function createCodexMasteryRecorder(
  store: CodexMasteryStore,
  catalog: CodexMasteryCatalog,
): { record(
  input: CodexMasteryRecordInput,
  settings: CodexMasteryRecordingSettings,
  now?: Date,
): Promise<CodexMasteryRecordResult> } {
  return {
    async record(input, settings, now = new Date()) {
      if (!settings.recordingEnabled) {
        return { recorded: false, reason: "disabled" };
      }

      const entry = catalog.get(input.category, input.entryId);
      if (!entry) {
        throw new CodexMasteryRecordError("unknown_entry", "codex mastery entry is unknown");
      }
      if (typeof input.source !== "string" || !SERVER_SOURCE_ID.test(input.source)) {
        throw new CodexMasteryRecordError("invalid_source", "source must be server-owned");
      }
      validateRequestedSeals(input.mutation, entry.seals);

      const locked = await store.lock({
        userId: input.userId,
        category: input.category,
        entryId: input.entryId,
      }, now);
      const mutation = settings.sealsEnabled
        ? input.mutation
        : { ...input.mutation, sealIds: [] };

      let transition: ReturnType<typeof applyCodexMasteryMutation>;
      try {
        transition = applyCodexMasteryMutation(entry, locked.progress, mutation, now);
      } catch (error) {
        const message = error instanceof Error ? error.message : "mutation is invalid";
        throw invalidMutation(message);
      }

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
    },
  };
}

export async function recordCodexMastery(
  executor: DbExecutor,
  catalog: CodexMasteryCatalog,
  input: CodexMasteryRecordInput,
  settings: CodexMasteryRecordingSettings,
  now = new Date(),
): Promise<CodexMasteryRecordResult> {
  const store = createDrizzleCodexMasteryStore(executor);
  return createCodexMasteryRecorder(store, catalog).record(input, settings, now);
}
