import { describe, expect, it } from "vitest";
import type {
  CodexMasteryCategory,
  CodexMasteryProgress,
  CodexMasteryTier,
} from "@/adventure/data/v2/codexMasteryTypes";
import { codexMasterySummary } from "@/db/schema";
import {
  emptyCodexMasterySummary,
  type CodexMasterySummaryState,
} from "./codexMasteryRepository";
import {
  aggregateCodexMasterySummary,
  compareCodexMasterySummary,
  createDrizzleCodexMasteryRepairStore,
  repairCodexMasterySummary,
  repairCodexMasterySummaryWithDatabase,
  type CodexMasteryRepairDatabase,
  type CodexMasteryRepairProgressRow,
  type CodexMasteryRepairStore,
} from "./codexMasteryRepair";
import type { DbExecutor } from "./savesKv";

function progressRow(options: {
  category?: CodexMasteryCategory;
  currentTier?: CodexMasteryTier;
  scoreMilli?: number;
  sealIds?: string[];
  updatedAt?: Date | null;
} = {}): CodexMasteryRepairProgressRow {
  const progress: CodexMasteryProgress = {
    category: options.category ?? "equipment",
    entryId: `${options.category ?? "equipment"}:entry`,
    count: 0,
    bestValue: null,
    currentTier: options.currentTier ?? "none",
    sealIds: options.sealIds ?? [],
    tierAchievedAt: {},
    scoreMilli: options.scoreMilli ?? 0,
  };
  return { ...progress, updatedAt: options.updatedAt ?? null };
}

type MemoryRepairStore = CodexMasteryRepairStore & {
  saveCalls: number;
  summary: CodexMasterySummaryState;
};

function repairStore(
  summary: Omit<Partial<CodexMasterySummaryState>, "categoryScoreMilli" | "stageCounts"> & {
    categoryScoreMilli?: Partial<CodexMasterySummaryState["categoryScoreMilli"]>;
    stageCounts?: Partial<CodexMasterySummaryState["stageCounts"]>;
  },
  progress: CodexMasteryRepairProgressRow[],
): MemoryRepairStore {
  const initial = emptyCodexMasterySummary();
  const store: MemoryRepairStore = {
    saveCalls: 0,
    summary: {
      ...initial,
      ...summary,
      categoryScoreMilli: {
        ...initial.categoryScoreMilli,
        ...summary.categoryScoreMilli,
      },
      stageCounts: { ...initial.stageCounts, ...summary.stageCounts },
    },
    async readSummary() {
      return store.summary;
    },
    async readProgress() {
      return progress;
    },
    async saveSummary(_, next) {
      store.saveCalls += 1;
      store.summary = next;
    },
  };
  return store;
}

type RecordedRepairExecutor = {
  executor: DbExecutor;
  events: string[];
  updates: Array<Record<string, unknown>>;
};

function persistedSummaryRow(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    userId: "user-1",
    totalScoreMilli: 0,
    equipmentScoreMilli: 0,
    fishScoreMilli: 0,
    monsterScoreMilli: 0,
    cookingScoreMilli: 0,
    lifeScoreMilli: 0,
    jobScoreMilli: 0,
    bronzeCount: 0,
    silverCount: 0,
    goldCount: 0,
    platinumCount: 0,
    diamondCount: 0,
    legendaryCount: 0,
    sealCount: 0,
    scoreReachedAt: null,
    updatedAt: new Date("2026-08-20T00:00:00.000Z"),
    ...overrides,
  };
}

function recordingRepairExecutor(options: {
  label: string;
  events?: string[];
  summaryRows?: unknown[];
  progressRows?: unknown[];
  updateRows?: unknown[];
}): RecordedRepairExecutor {
  const events = options.events ?? [];
  const updates: Array<Record<string, unknown>> = [];
  const summaryRows = options.summaryRows ?? [persistedSummaryRow()];
  const progressRows = options.progressRows ?? [];

  const executor = {
    select() {
      return {
        from(table: unknown) {
          return {
            where() {
              let locked = false;
              const rows = table === codexMasterySummary ? summaryRows : progressRows;
              const read = async () => {
                events.push(`${options.label}:${table === codexMasterySummary
                  ? locked ? "lock-summary" : "read-summary"
                  : "read-progress"}`);
                return rows;
              };
              return {
                for(mode: string) {
                  expect(mode).toBe("update");
                  locked = true;
                  return this;
                },
                limit: read,
                then<TResult1 = unknown[], TResult2 = never>(
                  onfulfilled?: ((value: unknown[]) => TResult1 | PromiseLike<TResult1>) | null,
                  onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
                ) {
                  return read().then(onfulfilled, onrejected);
                },
              };
            },
          };
        },
      };
    },
    update(table: unknown) {
      expect(table).toBe(codexMasterySummary);
      return {
        set(values: Record<string, unknown>) {
          updates.push(values);
          return {
            where() {
              return {
                async returning() {
                  events.push(`${options.label}:write-summary`);
                  return options.updateRows ?? [{ userId: "user-1" }];
                },
              };
            },
          };
        },
      };
    },
  } as unknown as DbExecutor;

  return { executor, events, updates };
}

describe("codex mastery summary repair", () => {
  it("rebuilds category scores and cumulative stage counts from progress rows", () => {
    // Break caught: summing only exact tiers, or omitting a stored score category.
    const rebuilt = aggregateCodexMasterySummary([
      progressRow({ category: "fish", currentTier: "gold", scoreMilli: 9_000, sealIds: ["giant"] }),
      progressRow({ category: "job", currentTier: "silver", scoreMilli: 4_000, sealIds: [] }),
    ]);

    expect(rebuilt).toMatchObject({
      totalScoreMilli: 13_000,
      categoryScoreMilli: { fish: 9_000, job: 4_000 },
      stageCounts: {
        bronze: 2,
        silver: 2,
        gold: 1,
        platinum: 0,
        diamond: 0,
        legendary: 0,
      },
      sealCount: 1,
    });
  });

  it("deduplicates seals within each progress row and falls back to the latest update time", () => {
    // Break caught: inflated seals from corrupted duplicate row values or unstable reach-time fallback.
    const latest = new Date("2026-08-20T01:00:00.000Z");
    const rebuilt = aggregateCodexMasterySummary([
      progressRow({
        category: "fish",
        currentTier: "bronze",
        scoreMilli: 1_000,
        sealIds: ["giant", "giant", "ancient"],
        updatedAt: new Date("2026-08-20T00:00:00.000Z"),
      }),
      progressRow({
        category: "monster",
        scoreMilli: 2_000,
        updatedAt: latest,
      }),
    ]);

    expect(rebuilt.sealCount).toBe(2);
    expect(rebuilt.scoreReachedAt).toEqual(latest);
  });

  it("reports field-level summary differences", () => {
    // Break caught: hiding a stale nested counter or treating equal date values as different.
    const before = emptyCodexMasterySummary();
    before.scoreReachedAt = new Date("2026-08-20T00:00:00.000Z");
    const after = {
      ...emptyCodexMasterySummary(),
      totalScoreMilli: 1_000,
      categoryScoreMilli: { ...emptyCodexMasterySummary().categoryScoreMilli, fish: 1_000 },
      stageCounts: { ...emptyCodexMasterySummary().stageCounts, bronze: 1 },
      scoreReachedAt: new Date("2026-08-20T00:00:00.000Z"),
    };

    expect(compareCodexMasterySummary(before, after)).toEqual({
      totalScoreMilli: { before: 0, after: 1_000 },
      "categoryScoreMilli.fish": { before: 0, after: 1_000 },
      "stageCounts.bronze": { before: 0, after: 1 },
    });
  });

  it("reports differences in dry-run mode without writing", async () => {
    // Break caught: a dry run mutating the persisted summary.
    const store = repairStore({ totalScoreMilli: 1 }, [
      progressRow({ category: "fish", currentTier: "gold", scoreMilli: 9_000 }),
    ]);

    const result = await repairCodexMasterySummary(store, "user-1", {
      apply: false,
      now: new Date("2026-08-20T00:00:00.000Z"),
    });

    expect(result.changed).toBe(true);
    expect(result.applied).toBe(false);
    expect(store.saveCalls).toBe(0);
  });

  it("retains an existing exact reach time when the rebuilt score is unchanged", async () => {
    // Break caught: replacing a known exact ranking tiebreaker with a coarse row-update fallback.
    const exact = new Date("2026-08-19T18:00:00.000Z");
    const store = repairStore({
      totalScoreMilli: 9_000,
      categoryScoreMilli: { fish: 9_000 },
      stageCounts: { bronze: 1, silver: 1, gold: 1 },
      scoreReachedAt: exact,
    }, [
      progressRow({
        category: "fish",
        currentTier: "gold",
        scoreMilli: 9_000,
        updatedAt: new Date("2026-08-20T00:00:00.000Z"),
      }),
    ]);

    const result = await repairCodexMasterySummary(store, "user-1", {
      apply: true,
      now: new Date("2026-08-20T01:00:00.000Z"),
    });

    expect(result.changed).toBe(false);
    expect(result.after.scoreReachedAt).toEqual(exact);
    expect(store.saveCalls).toBe(0);
  });

  it("applies only changed summaries when apply mode is selected", async () => {
    // Break caught: apply mode skipping stale summaries or writing already-repaired summaries.
    const changedStore = repairStore({}, [
      progressRow({ category: "life", currentTier: "bronze", scoreMilli: 1_000 }),
    ]);
    const unchangedStore = repairStore({}, []);
    const now = new Date("2026-08-20T00:00:00.000Z");

    await expect(repairCodexMasterySummary(changedStore, "user-1", { apply: true, now }))
      .resolves.toMatchObject({ changed: true, applied: true });
    await expect(repairCodexMasterySummary(unchangedStore, "user-2", { apply: true, now }))
      .resolves.toMatchObject({ changed: false, applied: false });

    expect(changedStore.saveCalls).toBe(1);
    expect(unchangedStore.saveCalls).toBe(0);
  });

  it("repairs negative raw summary fields instead of hiding them during normalization", async () => {
    // Break caught: normalizing raw -1 fields to zero makes a corrupt row appear unchanged.
    const corruptRow = persistedSummaryRow({
      fishScoreMilli: -1,
      bronzeCount: -1,
      sealCount: Number.MAX_SAFE_INTEGER + 1,
    });
    const dryExecutor = recordingRepairExecutor({
      label: "dry",
      summaryRows: [corruptRow],
    });
    const dryResult = await repairCodexMasterySummary(
      createDrizzleCodexMasteryRepairStore(dryExecutor.executor),
      "user-1",
      { apply: false, now: new Date("2026-08-20T01:00:00.000Z") },
    );

    expect(dryResult).toMatchObject({
      changed: true,
      applied: false,
      differences: {
        "categoryScoreMilli.fish": { before: -1, after: 0 },
        "stageCounts.bronze": { before: -1, after: 0 },
        sealCount: { before: Number.MAX_SAFE_INTEGER + 1, after: 0 },
      },
    });
    expect(dryExecutor.updates).toHaveLength(0);

    const events: string[] = [];
    const baseExecutor = recordingRepairExecutor({ label: "base", events });
    const transactionExecutor = recordingRepairExecutor({
      label: "tx",
      events,
      summaryRows: [corruptRow],
    });
    const database = Object.assign(baseExecutor.executor, {
      async transaction<T>(callback: (tx: DbExecutor) => Promise<T>): Promise<T> {
        events.push("transaction");
        return callback(transactionExecutor.executor);
      },
    }) as CodexMasteryRepairDatabase;

    const applyResult = await repairCodexMasterySummaryWithDatabase(
      database,
      "user-1",
      { apply: true, now: new Date("2026-08-20T01:00:00.000Z") },
    );

    expect(applyResult).toMatchObject({ changed: true, applied: true });
    expect(transactionExecutor.updates).toEqual([
      expect.objectContaining({ fishScoreMilli: 0, bronzeCount: 0, sealCount: 0 }),
    ]);
    expect(events).toEqual([
      "transaction",
      "tx:lock-summary",
      "tx:read-progress",
      "tx:write-summary",
    ]);
  });

  it("keeps dry-run non-locking but uses the transaction executor for apply", async () => {
    // Break caught: apply reads or writes on the base executor, or reads progress before locking summary.
    const dryEvents: string[] = [];
    const dryBase = recordingRepairExecutor({
      label: "base",
      events: dryEvents,
      summaryRows: [persistedSummaryRow({ totalScoreMilli: 1 })],
    });
    const unusedTx = recordingRepairExecutor({ label: "tx", events: dryEvents });
    const dryDatabase = Object.assign(dryBase.executor, {
      async transaction<T>(callback: (tx: DbExecutor) => Promise<T>): Promise<T> {
        dryEvents.push("transaction");
        return callback(unusedTx.executor);
      },
    }) as CodexMasteryRepairDatabase;

    await repairCodexMasterySummaryWithDatabase(
      dryDatabase,
      "user-1",
      { apply: false, now: new Date("2026-08-20T01:00:00.000Z") },
    );
    expect(dryEvents).toEqual(["base:read-summary", "base:read-progress"]);

    const applyEvents: string[] = [];
    const applyBase = recordingRepairExecutor({ label: "base", events: applyEvents });
    const applyTx = recordingRepairExecutor({
      label: "tx",
      events: applyEvents,
      summaryRows: [persistedSummaryRow({ totalScoreMilli: 1 })],
    });
    const applyDatabase = Object.assign(applyBase.executor, {
      async transaction<T>(callback: (tx: DbExecutor) => Promise<T>): Promise<T> {
        applyEvents.push("transaction");
        return callback(applyTx.executor);
      },
    }) as CodexMasteryRepairDatabase;

    await repairCodexMasterySummaryWithDatabase(
      applyDatabase,
      "user-1",
      { apply: true, now: new Date("2026-08-20T01:00:00.000Z") },
    );
    expect(applyEvents).toEqual([
      "transaction",
      "tx:lock-summary",
      "tx:read-progress",
      "tx:write-summary",
    ]);
  });

  it("fails apply when the production adapter update affects no summary row", async () => {
    // Break caught: a deleted or mistargeted summary row is reported as successfully repaired.
    const executor = recordingRepairExecutor({
      label: "tx",
      summaryRows: [persistedSummaryRow({ totalScoreMilli: 1 })],
      updateRows: [],
    });
    const store = createDrizzleCodexMasteryRepairStore(executor.executor, {
      lockSummary: true,
    });

    await expect(repairCodexMasterySummary(
      store,
      "user-1",
      { apply: true, now: new Date("2026-08-20T01:00:00.000Z") },
    )).rejects.toThrow("codex mastery summary row was not saved");
  });

  it("fails without saving when cumulative score arithmetic overflows", async () => {
    // Break caught: unsafe aggregate arithmetic is rounded and then persisted as a valid summary.
    const store = repairStore({}, [
      progressRow({ category: "fish", scoreMilli: Number.MAX_SAFE_INTEGER }),
      progressRow({ category: "job", scoreMilli: 1 }),
    ]);

    await expect(repairCodexMasterySummary(
      store,
      "user-1",
      { apply: true, now: new Date("2026-08-20T01:00:00.000Z") },
    )).rejects.toThrow("overflow a safe integer");
    expect(store.saveCalls).toBe(0);
  });
});
