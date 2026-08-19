import { describe, expect, it } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { codexMasteryProgress, codexMasterySummary } from "@/db/schema";
import type { DbExecutor } from "./savesKv";
import {
  codexMasterySummaryRowToState,
  codexMasteryRowToProgress,
  createDrizzleCodexMasteryStore,
  emptyCodexMasterySummary,
  lockCodexMasteryState,
  readCodexMasteryProgressRows,
  saveCodexMasteryState,
} from "./codexMasteryRepository";

type RecordedUpdate = {
  table: unknown;
  values: Record<string, unknown>;
  where: SQL;
};

type RecordedExecutor = {
  executor: DbExecutor;
  events: string[];
  updates: RecordedUpdate[];
};

function recordingExecutor(options: {
  summaryRows?: unknown[];
  progressRows?: unknown[];
  summaryUpdateRows?: unknown[];
  progressUpdateRows?: unknown[];
} = {}): RecordedExecutor {
  const events: string[] = [];
  const updates: RecordedUpdate[] = [];
  const summaryRow = {
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
  };
  const progressRow = {
    userId: "user-1",
    category: "fish",
    entryId: "fish:a",
    count: 0,
    bestValue: null,
    currentTier: "none",
    sealIds: [],
    tierAchievedAt: {},
    scoreMilli: 0,
    firstRecordedAt: new Date("2026-08-20T00:00:00.000Z"),
    updatedAt: new Date("2026-08-20T00:00:00.000Z"),
  };
  const summaryRows = options.summaryRows ?? [summaryRow];
  const progressRows = options.progressRows ?? [progressRow];
  const summaryUpdateRows = options.summaryUpdateRows ?? [{ userId: "user-1" }];
  const progressUpdateRows = options.progressUpdateRows ?? [{ userId: "user-1" }];

  const executor = {
    insert(table: unknown) {
      return {
        values() {
          return {
            async onConflictDoNothing() {
              events.push(table === codexMasterySummary ? "ensure-summary" : "ensure-progress");
            },
          };
        },
      };
    },
    select() {
      return {
        from(table: unknown) {
          return {
            where() {
              let lockMode: string | null = null;
              const rows = table === codexMasterySummary ? summaryRows : progressRows;
              const read = async () => {
                if (lockMode) {
                  expect(lockMode).toBe("update");
                  events.push(table === codexMasterySummary
                    ? "lock-summary"
                    : "lock-progress");
                }
                return rows;
              };
              return {
                for(mode: string) {
                  lockMode = mode;
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
      return {
        set(values: Record<string, unknown>) {
          return {
            where(condition: SQL) {
              updates.push({ table, values, where: condition });
              return {
                async returning() {
                  return table === codexMasterySummary
                    ? summaryUpdateRows
                    : progressUpdateRows;
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

describe("codex mastery repository", () => {
  it("normalizes corrupted persisted progress fields without changing its identity", () => {
    // Break caught: accepting corrupt counters, IDs, tiers, seals, or achievement timestamps.
    expect(codexMasteryRowToProgress({
      category: "fish",
      entryId: "fish:a",
      count: -4,
      bestValue: Number.NaN,
      currentTier: "bogus",
      sealIds: ["giant", "giant", 4],
      tierAchievedAt: { bronze: "bad", gold: "2026-08-20T00:00:00.000Z" },
      scoreMilli: -10,
    })).toEqual({
      category: "fish",
      entryId: "fish:a",
      count: 0,
      bestValue: null,
      currentTier: "none",
      sealIds: ["giant"],
      tierAchievedAt: {},
      scoreMilli: 0,
    });
  });

  it("keeps valid ISO timestamps at or below the persisted tier", () => {
    // Break caught: rejecting valid ISO forms or returning future/malformed achievement timestamps.
    expect(codexMasteryRowToProgress({
      category: "fish",
      entryId: "fish:a",
      count: 4,
      bestValue: 9.5,
      currentTier: "silver",
      sealIds: [],
      tierAchievedAt: {
        discovered: "0001-01-01T00:00:00Z",
        bronze: "2026-08-20T00:00:00,123Z",
        silver: "2026-02-30T00:00:00Z",
        gold: "2026-08-21T00:00:00.000Z",
      },
      scoreMilli: 5_000,
    })).toMatchObject({
      currentTier: "silver",
      tierAchievedAt: {
        discovered: "0001-01-01T00:00:00Z",
        bronze: "2026-08-20T00:00:00,123Z",
      },
    });
  });

  it("rejects rolled-over ISO calendar dates, times, and offsets", () => {
    // Break caught: JavaScript date rollover accepts malformed persisted timestamps.
    expect(codexMasteryRowToProgress({
      category: "fish",
      entryId: "fish:a",
      count: 4,
      bestValue: 9.5,
      currentTier: "legendary",
      sealIds: [],
      tierAchievedAt: {
        discovered: "2026-02-30T00:00:00Z",
        bronze: "2026-08-20T24:00:00Z",
        silver: "2026-08-20T00:00:00+24:00",
        gold: "2026-08-20T00:00:00-12:60",
      },
      scoreMilli: 5_000,
    }).tierAchievedAt).toEqual({});
  });

  it("ensures and locks the user summary before the entry row", async () => {
    // Break caught: entry locks acquired before the per-user summary lock can deadlock cross-entry writes.
    const fake = recordingExecutor();

    await expect(lockCodexMasteryState(
      fake.executor,
      "user-1",
      "fish",
      "fish:a",
      new Date("2026-08-20T00:00:00.000Z"),
    )).resolves.toEqual({
      summary: expect.objectContaining({ totalScoreMilli: 0 }),
      progress: expect.objectContaining({ category: "fish", entryId: "fish:a" }),
    });
    expect(fake.events).toEqual([
      "ensure-summary",
      "lock-summary",
      "ensure-progress",
      "lock-progress",
    ]);
  });

  it("stops after a missing summary lock without touching progress", async () => {
    // Break caught: a missing summary row lets this request acquire an entry lock first.
    const fake = recordingExecutor({ summaryRows: [] });

    await expect(lockCodexMasteryState(
      fake.executor,
      "user-1",
      "fish",
      "fish:a",
      new Date("2026-08-20T00:00:00.000Z"),
    )).rejects.toThrow("codex mastery summary row could not be locked");
    expect(fake.events).toEqual(["ensure-summary", "lock-summary"]);
  });

  it("fails after the progress lock when its row is missing", async () => {
    // Break caught: a missing entry row is reported only after the summary-first lock sequence.
    const fake = recordingExecutor({ progressRows: [] });

    await expect(lockCodexMasteryState(
      fake.executor,
      "user-1",
      "fish",
      "fish:a",
      new Date("2026-08-20T00:00:00.000Z"),
    )).rejects.toThrow("codex mastery progress row could not be locked");
    expect(fake.events).toEqual([
      "ensure-summary",
      "lock-summary",
      "ensure-progress",
      "lock-progress",
    ]);
  });

  it("normalizes corrupted persisted summary fields", () => {
    // Break caught: corrupt persisted summary counters or reach time leak into domain state.
    expect(codexMasterySummaryRowToState({
      totalScoreMilli: -1,
      equipmentScoreMilli: 2_000,
      fishScoreMilli: Number.NaN,
      monsterScoreMilli: 3.5,
      cookingScoreMilli: 4_000,
      lifeScoreMilli: Number.POSITIVE_INFINITY,
      jobScoreMilli: 6_000,
      bronzeCount: -1,
      silverCount: 2,
      goldCount: 3.5,
      platinumCount: 4,
      diamondCount: Number.NaN,
      legendaryCount: 6,
      sealCount: -1,
      scoreReachedAt: new Date("not a date"),
    })).toEqual({
      totalScoreMilli: 0,
      categoryScoreMilli: {
        equipment: 2_000,
        fish: 0,
        monster: 0,
        cooking: 4_000,
        life: 0,
        job: 6_000,
      },
      stageCounts: {
        bronze: 0,
        silver: 2,
        gold: 0,
        platinum: 4,
        diamond: 0,
        legendary: 6,
      },
      sealCount: 0,
      scoreReachedAt: null,
    });
  });

  it("normalizes progress rows read through the repository", async () => {
    // Break caught: read paths bypass the same corruption guard as locked rows.
    const fake = recordingExecutor({
      progressRows: [{
        category: "fish",
        entryId: "fish:a",
        count: -2,
        bestValue: Number.NaN,
        currentTier: "bogus",
        sealIds: ["giant", "giant", 3],
        tierAchievedAt: { bronze: "2026-08-20T00:00:00.000Z" },
        scoreMilli: -3,
      }],
    });

    await expect(readCodexMasteryProgressRows(fake.executor, "user-1")).resolves.toEqual([{
      category: "fish",
      entryId: "fish:a",
      count: 0,
      bestValue: null,
      currentTier: "none",
      sealIds: ["giant"],
      tierAchievedAt: {},
      scoreMilli: 0,
    }]);
  });

  it("targets both locked rows with the identical caller timestamp", async () => {
    // Break caught: one half of a save targets the wrong table or uses a different write time.
    const fake = recordingExecutor();
    const now = new Date("2026-08-20T00:00:00.000Z");
    const summary = emptyCodexMasterySummary();
    const progress = codexMasteryRowToProgress({
      category: "fish",
      entryId: "fish:a",
      count: 1,
      bestValue: 2,
      currentTier: "discovered",
      sealIds: [],
      tierAchievedAt: { discovered: "2026-08-20T00:00:00.000Z" },
      scoreMilli: 1_000,
    });

    await expect(saveCodexMasteryState(
      fake.executor,
      { userId: "user-1", summary, progress },
      now,
    )).resolves.toBeUndefined();
    expect(fake.updates).toEqual([
      expect.objectContaining({ table: codexMasterySummary }),
      expect.objectContaining({ table: codexMasteryProgress }),
    ]);
    expect(fake.updates.map(({ values }) => values.updatedAt)).toEqual([now, now]);
    expect(fake.updates[0].values.updatedAt).toBe(now);
    expect(fake.updates[1].values.updatedAt).toBe(now);
    const dialect = new PgDialect();
    const summaryTarget = dialect.sqlToQuery(fake.updates[0].where);
    const progressTarget = dialect.sqlToQuery(fake.updates[1].where);
    expect(summaryTarget.sql).toContain('"codex_mastery_summary"."user_id"');
    expect(summaryTarget.params).toEqual(["user-1"]);
    expect(progressTarget.sql).toContain('"codex_mastery_progress"."user_id"');
    expect(progressTarget.sql).toContain('"codex_mastery_progress"."category"');
    expect(progressTarget.sql).toContain('"codex_mastery_progress"."entry_id"');
    expect(progressTarget.params).toEqual(["user-1", "fish", "fish:a"]);
  });

  it("fails when the summary update affects no row", async () => {
    // Break caught: a partial save can silently continue after losing its summary row.
    const fake = recordingExecutor({ summaryUpdateRows: [] });

    await expect(saveCodexMasteryState(
      fake.executor,
      {
        userId: "user-1",
        summary: emptyCodexMasterySummary(),
        progress: codexMasteryRowToProgress({
          category: "fish", entryId: "fish:a", count: 0, bestValue: null,
          currentTier: "none", sealIds: [], tierAchievedAt: {}, scoreMilli: 0,
        }),
      },
      new Date("2026-08-20T00:00:00.000Z"),
    )).rejects.toThrow("codex mastery summary row was not saved");
    expect(fake.updates).toEqual([expect.objectContaining({ table: codexMasterySummary })]);
  });

  it("fails when the progress update affects no row", async () => {
    // Break caught: a wrong progress identity silently turns a save into a partial update.
    const fake = recordingExecutor({ progressUpdateRows: [] });

    await expect(saveCodexMasteryState(
      fake.executor,
      {
        userId: "user-1",
        summary: emptyCodexMasterySummary(),
        progress: codexMasteryRowToProgress({
          category: "fish", entryId: "fish:missing", count: 0, bestValue: null,
          currentTier: "none", sealIds: [], tierAchievedAt: {}, scoreMilli: 0,
        }),
      },
      new Date("2026-08-20T00:00:00.000Z"),
    )).rejects.toThrow("codex mastery progress row was not saved");
    expect(fake.updates).toEqual([
      expect.objectContaining({ table: codexMasterySummary }),
      expect.objectContaining({ table: codexMasteryProgress }),
    ]);
  });

  it("delegates the store boundary to the supplied executor", async () => {
    // Break caught: the store factory bypasses its caller's transaction-bound executor.
    const fake = recordingExecutor();
    const store = createDrizzleCodexMasteryStore(fake.executor);
    const now = new Date("2026-08-20T00:00:00.000Z");

    const locked = await store.lock({
      userId: "user-1",
      category: "fish",
      entryId: "fish:a",
    }, now);
    await store.save({ userId: "user-1", ...locked }, now);

    expect(fake.events).toEqual([
      "ensure-summary",
      "lock-summary",
      "ensure-progress",
      "lock-progress",
    ]);
    expect(fake.updates.map(({ table }) => table)).toEqual([
      codexMasterySummary,
      codexMasteryProgress,
    ]);
  });
});
