import { describe, expect, it } from "vitest";
import { emptyCodexMasteryProgress } from "@/adventure/data/v2/codexMastery";
import {
  createCodexMasteryCatalog,
  type CodexMasteryCatalog,
} from "@/adventure/data/v2/codexMasteryCatalog";
import type {
  CodexMasteryEntryDefinition,
  CodexMasteryProgress,
} from "@/adventure/data/v2/codexMasteryTypes";
import {
  emptyCodexMasterySummary,
  type CodexMasteryStore,
  type CodexMasterySummaryState,
} from "./codexMasteryRepository";
import {
  CodexMasteryRecordError,
  createCodexMasteryRecorder,
  type CodexMasteryRecordInput,
} from "./codexMasteryService";

const TEST_ENTRY: CodexMasteryEntryDefinition = {
  category: "fish",
  entryId: "fish:test-carp",
  label: "Test carp",
  thresholds: {
    bronze: 5,
    silver: 30,
    gold: 150,
    platinum: 500,
    diamond: 1_500,
    legendary: 5_000,
  },
  scoreWeightMilli: 1_000,
  seals: { giant: { pointUnits: 2 } },
};

const TEST_CATALOG: CodexMasteryCatalog = createCodexMasteryCatalog([TEST_ENTRY]);
const ENABLED = { recordingEnabled: true, sealsEnabled: true };

type MemoryCodexMasteryStore = CodexMasteryStore & {
  summary: CodexMasterySummaryState;
  progress: CodexMasteryProgress;
  lockCalls: number;
  saveCalls: number;
};

function memoryCodexMasteryStore(options: {
  summary?: CodexMasterySummaryState;
  progress?: CodexMasteryProgress;
} = {}): MemoryCodexMasteryStore {
  const store: MemoryCodexMasteryStore = {
    summary: options.summary ?? emptyCodexMasterySummary(),
    progress: options.progress ?? emptyCodexMasteryProgress("fish", TEST_ENTRY.entryId),
    lockCalls: 0,
    saveCalls: 0,
    async lock() {
      store.lockCalls += 1;
      return { summary: store.summary, progress: store.progress };
    },
    async save(input) {
      store.saveCalls += 1;
      store.summary = input.summary;
      store.progress = input.progress;
    },
  };
  return store;
}

function validInput(): CodexMasteryRecordInput {
  return {
    userId: "user-1",
    category: "fish",
    entryId: TEST_ENTRY.entryId,
    mutation: { amount: 1 },
    source: "fishing.catch",
  };
}

describe("recordCodexMastery", () => {
  it("updates entry and cumulative summary deltas exactly once", async () => {
    // Break caught: summary tiers, seals, or score use the final tier instead of transition deltas.
    const store = memoryCodexMasteryStore();
    const recorder = createCodexMasteryRecorder(store, TEST_CATALOG);

    const result = await recorder.record({
      userId: "user-1",
      category: "fish",
      entryId: "fish:test-carp",
      mutation: { amount: 150, sealIds: ["giant"] },
      source: "fishing.catch",
    }, ENABLED, new Date("2026-08-20T00:00:00.000Z"));

    expect(result).toMatchObject({
      recorded: true,
      newStages: ["discovered", "bronze", "silver", "gold"],
      newSealIds: ["giant"],
      scoreDeltaMilli: 9_000,
    });
    expect(store.summary).toMatchObject({
      totalScoreMilli: 9_000,
      categoryScoreMilli: { fish: 9_000 },
      stageCounts: { bronze: 1, silver: 1, gold: 1 },
      sealCount: 1,
      scoreReachedAt: new Date("2026-08-20T00:00:00.000Z"),
    });
    expect(store.saveCalls).toBe(1);
  });

  it("returns a no-op without locking when recording is disabled", async () => {
    // Break caught: the operations switch can still create or lock persisted rows.
    const store = memoryCodexMasteryStore();
    const recorder = createCodexMasteryRecorder(store, TEST_CATALOG);

    await expect(recorder.record(validInput(), {
      ...ENABLED,
      recordingEnabled: false,
    }, new Date())).resolves.toEqual({ recorded: false, reason: "disabled" });
    expect(store.lockCalls).toBe(0);
  });

  it("records stages but suppresses seals when seal scoring is disabled", async () => {
    // Break caught: disabling seals also suppresses unrelated count and stage progress.
    const store = memoryCodexMasteryStore();
    const recorder = createCodexMasteryRecorder(store, TEST_CATALOG);

    const result = await recorder.record({
      ...validInput(),
      mutation: { amount: 5, sealIds: ["giant"] },
    }, { ...ENABLED, sealsEnabled: false }, new Date());

    expect(result).toMatchObject({
      recorded: true,
      newSealIds: [],
      scoreDeltaMilli: 2_000,
    });
    expect(store.progress.sealIds).toEqual([]);
  });

  it("rejects unknown entries, blank sources, and client-derived sources", async () => {
    // Break caught: untrusted callers can create arbitrary progress rows or source names.
    const store = memoryCodexMasteryStore();
    const recorder = createCodexMasteryRecorder(store, TEST_CATALOG);

    await expect(recorder.record({
      ...validInput(),
      entryId: "fish:missing",
    }, ENABLED, new Date())).rejects.toMatchObject({ code: "unknown_entry" });
    await expect(recorder.record({
      ...validInput(),
      source: " ",
    }, ENABLED, new Date())).rejects.toMatchObject({ code: "invalid_source" });
    await expect(recorder.record({
      ...validInput(),
      source: "client",
    }, ENABLED, new Date())).rejects.toMatchObject({ code: "invalid_source" });
    expect(store.lockCalls).toBe(0);
  });

  it("rejects an unknown requested seal even when seal scoring is disabled", async () => {
    // Break caught: the seal switch hides integration typos from server-side validation.
    const store = memoryCodexMasteryStore();
    const recorder = createCodexMasteryRecorder(store, TEST_CATALOG);

    await expect(recorder.record({
      ...validInput(),
      mutation: { amount: 1, sealIds: ["missing"] },
    }, { ...ENABLED, sealsEnabled: false }, new Date())).rejects.toMatchObject({
      code: "invalid_mutation",
    });
    expect(store.lockCalls).toBe(0);
  });

  it("classifies invalid caller mutation before locking", async () => {
    // Break caught: malformed caller input creates a locked row before returning a typed error.
    const store = memoryCodexMasteryStore();
    const recorder = createCodexMasteryRecorder(store, TEST_CATALOG);

    await expect(recorder.record({
      ...validInput(),
      mutation: { amount: -1 },
    }, ENABLED, new Date())).rejects.toMatchObject({ code: "invalid_mutation" });
    expect(store.lockCalls).toBe(0);
  });

  it("does not convert a locked progress identity mismatch into caller input error", async () => {
    // Break caught: corrupt or mismatched stored state is mislabeled as an invalid caller mutation.
    const store = memoryCodexMasteryStore({
      progress: emptyCodexMasteryProgress("fish", "fish:wrong-entry"),
    });
    const recorder = createCodexMasteryRecorder(store, TEST_CATALOG);

    const error = await recorder.record(validInput(), ENABLED, new Date())
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(CodexMasteryRecordError);
    expect(error).toMatchObject({ message: "progress does not match definition" });
    expect(store.saveCalls).toBe(0);
  });

  it("does not write when a repeated event adds no progress", async () => {
    // Break caught: idempotent events issue unnecessary writes after no state changes.
    const store = memoryCodexMasteryStore();
    const recorder = createCodexMasteryRecorder(store, TEST_CATALOG);

    await recorder.record(validInput(), ENABLED, new Date());
    store.saveCalls = 0;
    const result = await recorder.record({
      ...validInput(),
      mutation: { amount: 0 },
    }, ENABLED, new Date());

    expect(result).toEqual({ recorded: false, reason: "unchanged" });
    expect(store.saveCalls).toBe(0);
  });

  it.each([
    {
      name: "total score",
      mutation: { amount: 1 },
      overflow: (summary: CodexMasterySummaryState) => {
        summary.totalScoreMilli = Number.MAX_SAFE_INTEGER;
      },
    },
    {
      name: "matching category score",
      mutation: { amount: 1 },
      overflow: (summary: CodexMasterySummaryState) => {
        summary.categoryScoreMilli.fish = Number.MAX_SAFE_INTEGER;
      },
    },
    {
      name: "seal count",
      mutation: { amount: 0, sealIds: ["giant"] },
      overflow: (summary: CodexMasterySummaryState) => {
        summary.sealCount = Number.MAX_SAFE_INTEGER;
      },
    },
    ...([
      ["bronze", 5],
      ["silver", 30],
      ["gold", 150],
      ["platinum", 500],
      ["diamond", 1_500],
      ["legendary", 5_000],
    ] as const).map(([stage, amount]) => ({
      name: `${stage} stage count`,
      mutation: { amount },
      overflow: (summary: CodexMasterySummaryState) => {
        summary.stageCounts[stage] = Number.MAX_SAFE_INTEGER;
      },
    })),
  ])("rejects $name overflow before saving", async ({ mutation, overflow }) => {
    // Break caught: any summary aggregate can overflow and still reach persistence.
    const summary = emptyCodexMasterySummary();
    overflow(summary);
    const store = memoryCodexMasteryStore({ summary });
    const recorder = createCodexMasteryRecorder(store, TEST_CATALOG);

    await expect(recorder.record({ ...validInput(), mutation }, ENABLED, new Date()))
      .rejects.toMatchObject({ code: "invalid_mutation" });
    expect(store.saveCalls).toBe(0);
  });
});
