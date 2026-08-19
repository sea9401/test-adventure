import type { FishId } from "@/adventure/data/v2/fish";
import { CODEX_MASTERY_CATALOG } from "@/adventure/data/v2/codexMasteryProductionCatalog";
import type { DbTransactionExecutor } from "./savesKv";
import { readCodexMasteryFeatureSettings } from "./opsSettings";
import {
  recordCodexMastery,
  type CodexMasteryRecordInput,
  type CodexMasteryRecordResult,
  type CodexMasteryRecordingSettings,
} from "./codexMasteryService";

export type CodexMasteryGameplayEvent =
  | {
      category: "fish";
      entryId: FishId;
      amount: number;
      bestValue: number;
      source: "fishing.catch";
    }
  | {
      category: "monster";
      entryId: string;
      amount: number;
      source: "hunt.victory";
    }
  | {
      category: "job";
      entryId: string;
      amount: number;
      source: "job.victory" | "job.activity" | "job.training" | "job.consumable";
    };

export type CodexMasteryGameplayRecorderRuntime<Executor> = {
  readSettings(executor: Executor): Promise<CodexMasteryRecordingSettings>;
  record(
    executor: Executor,
    input: CodexMasteryRecordInput,
    settings: CodexMasteryRecordingSettings,
    now: Date,
  ): Promise<CodexMasteryRecordResult>;
};

type AggregatedEvent = {
  category: CodexMasteryGameplayEvent["category"];
  entryId: string;
  amount: number;
  bestValue?: number;
  source: CodexMasteryGameplayEvent["source"];
};

function eventKey(event: CodexMasteryGameplayEvent): string {
  return `${event.category}:${event.entryId}:${event.source}`;
}

function validateEvent(event: CodexMasteryGameplayEvent): void {
  if (!Number.isSafeInteger(event.amount) || event.amount < 0) {
    throw new Error("codex mastery gameplay amount must be a non-negative safe integer");
  }
  if (
    event.category === "fish" &&
    (!Number.isFinite(event.bestValue) || event.bestValue < 0)
  ) {
    throw new Error("codex mastery gameplay bestValue must be finite and non-negative");
  }
}

function safeAdd(left: number, right: number): number {
  const result = left + right;
  if (!Number.isSafeInteger(result)) {
    throw new Error("codex mastery gameplay aggregate must be a safe integer");
  }
  return result;
}

function inputFor(userId: string, event: AggregatedEvent): CodexMasteryRecordInput {
  const mutation = {
    amount: event.amount,
    discovered: true,
    ...(event.bestValue === undefined ? {} : { bestValue: event.bestValue }),
  };
  if (event.category === "fish") {
    return {
      userId,
      category: "fish",
      entryId: event.entryId,
      mutation,
      source: "fishing.catch",
    };
  }
  if (event.category === "monster") {
    return {
      userId,
      category: "monster",
      entryId: event.entryId,
      mutation,
      source: "hunt.victory",
    };
  }
  return {
    userId,
    category: "job",
    entryId: event.entryId,
    mutation,
    source: event.source as Extract<
      CodexMasteryGameplayEvent,
      { category: "job" }
    >["source"],
  };
}

export function createCodexMasteryGameplayRecorder<Executor>(
  runtime: CodexMasteryGameplayRecorderRuntime<Executor>,
) {
  return async (
    executor: Executor,
    userId: string,
    events: readonly CodexMasteryGameplayEvent[],
    now: Date,
  ): Promise<CodexMasteryRecordResult[]> => {
    const settings = await runtime.readSettings(executor);
    if (!settings.recordingEnabled) return [];

    const aggregated = new Map<string, AggregatedEvent>();
    for (const event of events) {
      validateEvent(event);
      if (event.amount === 0) continue;
      const key = eventKey(event);
      const previous = aggregated.get(key);
      aggregated.set(key, {
        category: event.category,
        entryId: event.entryId,
        amount: safeAdd(previous?.amount ?? 0, event.amount),
        source: event.source,
        ...(event.category === "fish"
          ? { bestValue: Math.max(previous?.bestValue ?? 0, event.bestValue) }
          : {}),
      });
    }

    const results: CodexMasteryRecordResult[] = [];
    for (const event of [...aggregated.values()].sort((left, right) =>
      left.category.localeCompare(right.category) ||
      left.entryId.localeCompare(right.entryId) ||
      left.source.localeCompare(right.source)
    )) {
      results.push(await runtime.record(
        executor,
        inputFor(userId, event),
        settings,
        now,
      ));
    }
    return results;
  };
}

export const recordCodexMasteryGameplayBatch = createCodexMasteryGameplayRecorder<
  DbTransactionExecutor
>({
  readSettings: readCodexMasteryFeatureSettings,
  record: (executor, input, settings, now) => recordCodexMastery(
    executor,
    CODEX_MASTERY_CATALOG,
    input,
    settings,
    now,
  ),
});
