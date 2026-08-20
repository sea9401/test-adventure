import { describe, expect, expectTypeOf, it } from "vitest";
import { emptyCodexMasteryProgress } from "@/adventure/data/v2/codexMastery";
import {
  createCodexMasteryCatalog,
  type CodexMasteryCatalog,
} from "@/adventure/data/v2/codexMasteryCatalog";
import { CODEX_MASTERY_CATALOG } from "@/adventure/data/v2/codexMasteryProductionCatalog";
import type {
  CodexMasteryCategory,
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
  type CodexMasterySourceForCategory,
  createCodexMasteryRecorder,
  type CodexMasteryRecordInput,
  type CodexMasteryTargetInput,
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
const ENABLED = {
  recordingEnabled: true,
  sealsEnabled: true,
  trophiesEnabled: false,
};

const REQUIRED_SOURCES = [
  ["fish", "fishing.catch"],
  ["monster", "hunt.victory"],
  ["equipment", "equipment.drop"],
  ["equipment", "equipment.craft"],
  ["cooking", "cooking.complete"],
  ["life", "life.complete"],
  ["job", "job.victory"],
  ["job", "job.activity"],
  ["job", "job.training"],
  ["job", "job.consumable"],
] as const satisfies readonly (readonly [CodexMasteryCategory, string])[];

function testEntry(category: CodexMasteryCategory): CodexMasteryEntryDefinition {
  return {
    ...TEST_ENTRY,
    category,
    entryId: `${category}:test-entry`,
    label: `Test ${category}`,
  };
}

const REQUIRED_SOURCE_CATALOG = createCodexMasteryCatalog(
  [...new Set(REQUIRED_SOURCES.map(([category]) => category))].map(testEntry),
);

type MemoryCodexMasteryStore = CodexMasteryStore & {
  summary: CodexMasterySummaryState;
  progress: CodexMasteryProgress;
  lockCalls: number;
  saveCalls: number;
  reconcileCalls: number;
};

function memoryCodexMasteryStore(options: {
  summary?: CodexMasterySummaryState;
  progress?: CodexMasteryProgress;
  reconcileError?: Error;
} = {}): MemoryCodexMasteryStore {
  const store: MemoryCodexMasteryStore = {
    summary: options.summary ?? emptyCodexMasterySummary(),
    progress: options.progress ?? emptyCodexMasteryProgress("fish", TEST_ENTRY.entryId),
    lockCalls: 0,
    saveCalls: 0,
    reconcileCalls: 0,
    async lock() {
      store.lockCalls += 1;
      return { summary: store.summary, progress: store.progress };
    },
    async save(input) {
      store.saveCalls += 1;
      store.summary = input.summary;
      store.progress = input.progress;
    },
    async reconcileTrophies() {
      store.reconcileCalls += 1;
      if (options.reconcileError) throw options.reconcileError;
      return {
        promotions: [{
          trophyId: "mastery:fish",
          tier: "bronze",
          achievedAt: "2026-08-20T00:00:00.000Z",
        }],
      };
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
  it("types authoritative sources by their compatible category", () => {
    expectTypeOf<CodexMasterySourceForCategory<"fish">>()
      .toEqualTypeOf<"fishing.catch" | "codex.backfill.v1">();
    expectTypeOf<CodexMasterySourceForCategory<"equipment">>()
      .toEqualTypeOf<"equipment.drop" | "equipment.craft" | "codex.backfill.v1">();
    expectTypeOf<CodexMasterySourceForCategory<"job">>()
      .toEqualTypeOf<
        | "job.victory"
        | "job.activity"
        | "job.training"
        | "job.consumable"
        | "codex.backfill.v1"
      >();
    expectTypeOf<"hunt.victory">().not
      .toMatchTypeOf<CodexMasterySourceForCategory<"fish">>();
  });

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
      scoredCategoryCount: 1,
      scoreReachedAt: new Date("2026-08-20T00:00:00.000Z"),
      categoryScoreReachedAt: {
        fish: new Date("2026-08-20T00:00:00.000Z"),
      },
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

  it("does not access trophy history while its independent switch is disabled", async () => {
    const store = memoryCodexMasteryStore();
    const recorder = createCodexMasteryRecorder(store, TEST_CATALOG);

    await recorder.record({
      ...validInput(),
      mutation: { amount: 5 },
    }, ENABLED, new Date("2026-08-20T00:00:00.000Z"));

    expect(store.reconcileCalls).toBe(0);
  });

  it("reconciles after saving a count-tier promotion and returns grouped promotions", async () => {
    const store = memoryCodexMasteryStore();
    const recorder = createCodexMasteryRecorder(store, TEST_CATALOG);

    const result = await recorder.record({
      ...validInput(),
      mutation: { amount: 5 },
    }, { ...ENABLED, trophiesEnabled: true }, new Date(
      "2026-08-20T00:00:00.000Z",
    ));

    expect(store.reconcileCalls).toBe(1);
    expect(result).toMatchObject({
      recorded: true,
      newTrophyPromotions: [{
        trophyId: "mastery:fish",
        tier: "bronze",
        achievedAt: "2026-08-20T00:00:00.000Z",
      }],
    });
  });

  it("skips trophy reconciliation for discovery-only progress", async () => {
    const store = memoryCodexMasteryStore();
    const recorder = createCodexMasteryRecorder(store, TEST_CATALOG);

    await recorder.record(validInput(), {
      ...ENABLED,
      trophiesEnabled: true,
    }, new Date("2026-08-20T00:00:00.000Z"));

    expect(store.reconcileCalls).toBe(0);
  });

  it("propagates trophy persistence failure after the mastery save", async () => {
    const store = memoryCodexMasteryStore({
      reconcileError: new Error("trophy write failed"),
    });
    const recorder = createCodexMasteryRecorder(store, TEST_CATALOG);

    await expect(recorder.record({
      ...validInput(),
      mutation: { amount: 5 },
    }, { ...ENABLED, trophiesEnabled: true }, new Date()))
      .rejects.toThrow("trophy write failed");
    expect(store.saveCalls).toBe(1);
    expect(store.reconcileCalls).toBe(1);
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
    } as unknown as CodexMasteryRecordInput, ENABLED, new Date())).rejects.toMatchObject({
      code: "invalid_source",
    });
    await expect(recorder.record({
      ...validInput(),
      source: "client",
    } as unknown as CodexMasteryRecordInput, ENABLED, new Date())).rejects.toMatchObject({
      code: "invalid_source",
    });
    expect(store.lockCalls).toBe(0);
  });

  it.each(REQUIRED_SOURCES)(
    "accepts the registered %s source %s",
    async (category, source) => {
      // Break caught: a required authoritative gameplay integration is absent from the registry.
      const entry = testEntry(category);
      const store = memoryCodexMasteryStore({
        progress: emptyCodexMasteryProgress(category, entry.entryId),
      });
      const recorder = createCodexMasteryRecorder(store, REQUIRED_SOURCE_CATALOG);

      await expect(recorder.record({
        userId: "user-1",
        category,
        entryId: entry.entryId,
        mutation: { amount: 1 },
        source,
      } as CodexMasteryRecordInput, ENABLED, new Date(
        "2026-08-20T00:00:00.000Z",
      ))).resolves.toMatchObject({
        recorded: true,
      });
      expect(store.lockCalls).toBe(1);
    },
  );

  it.each([
    ["fish", "client.forged"],
    ["fish", "fishing.cath"],
    ["fish", "hunt.victory"],
    ["monster", "fishing.catch"],
  ] as const)(
    "rejects unregistered or category-mismatched source %s/%s before locking",
    async (category, source) => {
      // Break caught: syntax-valid forged, misspelled, or cross-category sources reach the lock.
      const entry = testEntry(category);
      const store = memoryCodexMasteryStore({
        progress: emptyCodexMasteryProgress(category, entry.entryId),
      });
      const recorder = createCodexMasteryRecorder(store, REQUIRED_SOURCE_CATALOG);

      await expect(recorder.record({
        userId: "user-1",
        category,
        entryId: entry.entryId,
        mutation: { amount: 1 },
        source,
      } as unknown as CodexMasteryRecordInput, ENABLED, new Date())).rejects.toMatchObject({
        code: "invalid_source",
      });
      expect(store.lockCalls).toBe(0);
    },
  );

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

  it("accepts a consistent timestamp-free backfill without re-awarding stages", async () => {
    // Break caught: supported historical rows need fabricated timestamps to avoid double scoring.
    const progress: CodexMasteryProgress = {
      ...emptyCodexMasteryProgress("fish", TEST_ENTRY.entryId),
      count: 30,
      currentTier: "silver",
      scoreMilli: 4_000,
      tierAchievedAt: {},
    };
    const store = memoryCodexMasteryStore({ progress });
    const recorder = createCodexMasteryRecorder(store, TEST_CATALOG);

    await expect(recorder.record({
      ...validInput(),
      mutation: { amount: 0 },
    }, ENABLED, new Date("2026-08-20T00:00:00.000Z"))).resolves.toEqual({
      recorded: false,
      reason: "unchanged",
    });
    expect(store.saveCalls).toBe(0);
  });

  it("continues recording a legendary job row scored with the published v1 weight", async () => {
    // Break caught: adding job definitions reinterprets persisted scores and rolls back hunting.
    const summary = Object.assign(emptyCodexMasterySummary(), {
      totalScoreMilli: 74_624,
      categoryScoreMilli: {
        ...emptyCodexMasterySummary().categoryScoreMilli,
        job: 74_624,
      },
      scoredCategoryCount: 1,
    });
    const progress: CodexMasteryProgress = {
      ...emptyCodexMasteryProgress("job", "warrior"),
      count: 10_000,
      currentTier: "legendary",
      scoreMilli: 74_624,
      tierAchievedAt: {},
    };
    const store = memoryCodexMasteryStore({ summary, progress });
    const recorder = createCodexMasteryRecorder(store, CODEX_MASTERY_CATALOG);

    await expect(recorder.record({
      userId: "user-1",
      category: "job",
      entryId: "warrior",
      mutation: { amount: 1 },
      source: "job.victory",
    }, ENABLED, new Date("2026-08-21T00:00:00.000Z"))).resolves.toMatchObject({
      recorded: true,
      progress: { count: 10_001, scoreMilli: 74_624 },
    });
    expect(store.summary).toMatchObject({
      totalScoreMilli: 74_624,
      categoryScoreMilli: { job: 74_624 },
    });
    expect(store.saveCalls).toBe(1);
  });

  it("normalizes a registered compatible score in progress and summary together", async () => {
    // Break caught: a recognized short-lived weight is either rejected or repairs only one row.
    const compatibleCatalog = createCodexMasteryCatalog([{
      ...TEST_ENTRY,
      compatibleScoreWeightsMilli: [900],
    }]);
    const summary = Object.assign(emptyCodexMasterySummary(), {
      totalScoreMilli: 3_600,
      categoryScoreMilli: {
        ...emptyCodexMasterySummary().categoryScoreMilli,
        fish: 3_600,
      },
      scoredCategoryCount: 1,
    });
    const progress: CodexMasteryProgress = {
      ...emptyCodexMasteryProgress("fish", TEST_ENTRY.entryId),
      count: 30,
      currentTier: "silver",
      scoreMilli: 3_600,
      tierAchievedAt: {},
    };
    const store = memoryCodexMasteryStore({ summary, progress });
    const recorder = createCodexMasteryRecorder(store, compatibleCatalog);

    await expect(recorder.record({
      ...validInput(),
      mutation: { amount: 1 },
    }, ENABLED, new Date("2026-08-21T00:00:00.000Z"))).resolves.toMatchObject({
      recorded: true,
      progress: { count: 31, scoreMilli: 4_000 },
      scoreDeltaMilli: 0,
    });
    expect(store.summary).toMatchObject({
      totalScoreMilli: 4_000,
      categoryScoreMilli: { fish: 4_000 },
    });
    expect(store.saveCalls).toBe(1);
  });

  it.each([
    {
      label: "unknown stored seal",
      progress: {
        ...emptyCodexMasteryProgress("fish", TEST_ENTRY.entryId),
        count: 30,
        currentTier: "silver" as const,
        sealIds: ["missing"],
        scoreMilli: 4_000,
      },
    },
    {
      label: "tier/count mismatch",
      progress: {
        ...emptyCodexMasteryProgress("fish", TEST_ENTRY.entryId),
        count: 1,
        currentTier: "silver" as const,
        scoreMilli: 4_000,
        tierAchievedAt: {
          discovered: "2026-08-19T00:00:00.000Z",
          bronze: "2026-08-19T00:00:00.000Z",
          silver: "2026-08-19T00:00:00.000Z",
        },
      },
    },
    {
      label: "authoritative score mismatch",
      progress: {
        ...emptyCodexMasteryProgress("fish", TEST_ENTRY.entryId),
        count: 30,
        currentTier: "silver" as const,
        scoreMilli: 3_000,
        tierAchievedAt: {
          discovered: "2026-08-19T00:00:00.000Z",
          bronze: "2026-08-19T00:00:00.000Z",
          silver: "2026-08-19T00:00:00.000Z",
        },
      },
    },
  ])("fails closed on a locked $label", async ({ progress }) => {
    // Break caught: corrupt authoritative state is normalized or rewritten into a new award.
    const store = memoryCodexMasteryStore({ progress });
    const recorder = createCodexMasteryRecorder(store, TEST_CATALOG);

    const error = await recorder.record({
      ...validInput(),
      mutation: { amount: 0 },
    }, ENABLED, new Date()).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(CodexMasteryRecordError);
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

  it("syncs an absolute backfill target from the locked count exactly once", async () => {
    // Break caught: a backfill adds its historical total on top of progress recorded before apply.
    const store = memoryCodexMasteryStore({
      progress: {
        ...emptyCodexMasteryProgress("fish", TEST_ENTRY.entryId),
        count: 5,
        bestValue: 40,
        currentTier: "bronze",
        scoreMilli: 2_000,
        tierAchievedAt: {},
      },
    });
    const recorder = createCodexMasteryRecorder(store, TEST_CATALOG);
    const input: CodexMasteryTargetInput = {
      userId: "user-1",
      category: "fish",
      entryId: TEST_ENTRY.entryId,
      target: { count: 30, discovered: true, bestValue: 80 },
      source: "codex.backfill.v1",
    };

    await expect(recorder.syncTarget(input, ENABLED, new Date(
      "2026-08-20T00:00:00.000Z",
    ))).resolves.toMatchObject({
      recorded: true,
      newStages: ["silver"],
      scoreDeltaMilli: 2_000,
      progress: { count: 30, bestValue: 80, currentTier: "silver" },
    });

    store.saveCalls = 0;
    await expect(recorder.syncTarget(input, ENABLED, new Date(
      "2026-08-21T00:00:00.000Z",
    ))).resolves.toEqual({ recorded: false, reason: "unchanged" });
    expect(store.saveCalls).toBe(0);
  });

  it("never lowers an existing count or best value when a target is older", async () => {
    // Break caught: stale legacy data overwrites progress earned after recording was enabled.
    const store = memoryCodexMasteryStore({
      progress: {
        ...emptyCodexMasteryProgress("fish", TEST_ENTRY.entryId),
        count: 30,
        bestValue: 100,
        currentTier: "silver",
        scoreMilli: 4_000,
        tierAchievedAt: {},
      },
    });
    const recorder = createCodexMasteryRecorder(store, TEST_CATALOG);

    await expect(recorder.syncTarget({
      userId: "user-1",
      category: "fish",
      entryId: TEST_ENTRY.entryId,
      target: { count: 5, bestValue: 80 },
      source: "codex.backfill.v1",
    }, ENABLED, new Date())).resolves.toEqual({ recorded: false, reason: "unchanged" });
    expect(store.progress).toMatchObject({ count: 30, bestValue: 100 });
    expect(store.saveCalls).toBe(0);
  });

  it("validates absolute targets and disabled state before locking", async () => {
    // Break caught: malformed or disabled backfill targets create persistence rows.
    const store = memoryCodexMasteryStore();
    const recorder = createCodexMasteryRecorder(store, TEST_CATALOG);
    const invalid = {
      userId: "user-1",
      category: "fish",
      entryId: TEST_ENTRY.entryId,
      target: { count: -1 },
      source: "codex.backfill.v1",
    } as CodexMasteryTargetInput;

    await expect(recorder.syncTarget(invalid, ENABLED, new Date()))
      .rejects.toMatchObject({ code: "invalid_mutation" });
    await expect(recorder.syncTarget({
      ...invalid,
      target: { count: 1 },
    }, { ...ENABLED, recordingEnabled: false }, new Date())).resolves.toEqual({
      recorded: false,
      reason: "disabled",
    });
    expect(store.lockCalls).toBe(0);
  });

  it("increments scored categories only on zero-to-positive crossings", async () => {
    // Break caught: repeated score in one category inflates diversity, or a new category is missed.
    const existingReach = new Date("2026-08-20T00:00:00.000Z");
    const summary = Object.assign(emptyCodexMasterySummary(), {
      totalScoreMilli: 1_000,
      categoryScoreMilli: {
        ...emptyCodexMasterySummary().categoryScoreMilli,
        fish: 1_000,
      },
      scoredCategoryCount: 1,
      categoryScoreReachedAt: {
        equipment: null,
        fish: existingReach,
        monster: null,
        cooking: null,
        life: null,
        job: null,
      },
    });
    const monster = testEntry("monster");
    const store = memoryCodexMasteryStore({
      summary,
      progress: emptyCodexMasteryProgress("monster", monster.entryId),
    });
    const recorder = createCodexMasteryRecorder(store, REQUIRED_SOURCE_CATALOG);
    const now = new Date("2026-08-21T00:00:00.000Z");

    await recorder.record({
      userId: "user-1",
      category: "monster",
      entryId: monster.entryId,
      mutation: { amount: 1 },
      source: "hunt.victory",
    }, ENABLED, now);

    expect(store.summary).toMatchObject({
      totalScoreMilli: 2_000,
      categoryScoreMilli: { fish: 1_000, monster: 1_000 },
      scoredCategoryCount: 2,
      scoreReachedAt: now,
      categoryScoreReachedAt: { fish: existingReach, monster: now },
    });
  });

  it("never moves total or category score reach timestamps backwards", async () => {
    // Break caught: an older historical event makes a later score rank as if reached earlier.
    const reachedAt = new Date("2026-08-20T00:00:00.000Z");
    const summary = Object.assign(emptyCodexMasterySummary(), {
      totalScoreMilli: 1_000,
      categoryScoreMilli: {
        ...emptyCodexMasterySummary().categoryScoreMilli,
        fish: 1_000,
      },
      scoredCategoryCount: 1,
      scoreReachedAt: reachedAt,
      categoryScoreReachedAt: {
        equipment: null,
        fish: reachedAt,
        monster: null,
        cooking: null,
        life: null,
        job: null,
      },
    });
    const progress = {
      ...emptyCodexMasteryProgress("fish", TEST_ENTRY.entryId),
      count: 1,
      currentTier: "discovered" as const,
      scoreMilli: 1_000,
      tierAchievedAt: { discovered: "2026-08-20T00:00:00.000Z" },
    };
    const store = memoryCodexMasteryStore({ summary, progress });
    const recorder = createCodexMasteryRecorder(store, TEST_CATALOG);

    await recorder.record({
      ...validInput(),
      mutation: { amount: 4 },
    }, ENABLED, new Date("2026-08-19T00:00:00.000Z"));

    expect(store.summary.scoreReachedAt).toEqual(reachedAt);
    expect(store.summary).toMatchObject({
      scoredCategoryCount: 1,
      categoryScoreReachedAt: { fish: reachedAt },
    });
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
    {
      name: "scored category count",
      mutation: { amount: 1 },
      overflow: (summary: CodexMasterySummaryState) => {
        (summary as CodexMasterySummaryState & { scoredCategoryCount: number })
          .scoredCategoryCount = Number.MAX_SAFE_INTEGER;
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
