import { describe, expect, expectTypeOf, it } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type {
  CodexResearchDefinitionSnapshot,
  CodexResearchObjective,
} from "@/adventure/data/v2/codexResearch";
import {
  emptyCodexResearchProgress,
  kstCodexResearchSeasonWindow,
} from "@/adventure/data/v2/codexResearch";
import { db } from "@/db";
import {
  codexResearchProgress,
  codexResearchSeasons,
} from "@/db/schema";
import type { DbTransactionExecutor } from "./savesKv";
import {
  activateCodexResearchSeason,
  codexResearchProgressRowToState,
  codexResearchSeasonRowToState,
  closeCodexResearchSeason,
  lockCodexResearchSeasonForSettlement,
  markCodexResearchSeasonSettling,
  markCodexResearchSeasonResettling,
  lockCodexResearchProgress,
  readCurrentCodexResearchSeason,
  saveCodexResearchProgress,
  scheduleCodexResearchSeason,
  writeCodexResearchFinalResults,
} from "./codexResearchRepository";

const NOW = new Date("2026-08-20T03:04:05.000Z");

function definition(): CodexResearchDefinitionSnapshot {
  const groups: Array<[
    CodexResearchObjective["group"],
    number,
    number,
  ]> = [
    ["basic", 6, 400],
    ["field", 6, 600],
    ["expert", 4, 1_000],
    ["challenge", 2, 1_000],
  ];
  return {
    version: 1,
    seasonId: "2026-08",
    themeId: "rivers-and-lakes",
    themeName: "강과 호수의 달",
    primaryCategories: ["fish", "life"],
    supportCategory: "cooking",
    objectives: groups.flatMap(([group, count, points]) =>
      Array.from({ length: count }, (_, index) => ({
        id: `${group}-${index + 1}`,
        group,
        label: `${group} ${index + 1}`,
        description: "설명",
        points,
        filter: { category: "fish" as const, sources: ["fishing.catch" as const] },
        rule: { kind: "count" as const, target: 3 },
      }))
    ),
    diversityTracks: [
      {
        id: "fish-variety",
        label: "어종",
        filter: { category: "fish", sources: ["fishing.catch"] },
        pointsPerEntry: 300,
        maxEntries: 10,
      },
      {
        id: "field-variety",
        label: "현장",
        filter: { category: "life", sources: ["life.complete"] },
        pointsPerEntry: 200,
        maxEntries: 10,
      },
    ],
    recordTracks: [
      {
        id: "record-a",
        label: "기록 A",
        filter: { category: "fish", sources: ["fishing.catch"] },
        milestones: [{ value: 10, score: 1_500 }],
      },
      {
        id: "record-b",
        label: "기록 B",
        filter: { category: "fish", sources: ["fishing.catch"] },
        milestones: [{ value: 10, score: 1_500 }],
      },
    ],
  };
}

function seasonRow(overrides: Record<string, unknown> = {}) {
  const snapshot = definition();
  const window = kstCodexResearchSeasonWindow(snapshot.seasonId);
  return {
    seasonId: snapshot.seasonId,
    themeId: snapshot.themeId,
    definitionSnapshot: snapshot,
    startAt: window.startAt,
    endAt: window.endAt,
    status: "scheduled",
    settledAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function progressRow(overrides: Record<string, unknown> = {}) {
  return {
    userId: "user-1",
    seasonId: "2026-08",
    ...emptyCodexResearchProgress(),
    finalRank: null,
    finalTier: null,
    updatedAt: NOW,
    ...overrides,
  };
}

type FakeOptions = {
  seasonRows?: unknown[];
  progressRows?: unknown[];
  scheduleRows?: unknown[];
  saveRows?: unknown[];
  activateRows?: unknown[];
};

function fakeExecutor(options: FakeOptions = {}) {
  const events: string[] = [];
  const inserted: Array<{ table: unknown; values: Record<string, unknown> }> = [];
  const selects: Array<{ table: unknown; where: SQL }> = [];
  const updates: Array<{
    table: unknown;
    values: Record<string, unknown>;
    where: SQL;
  }> = [];
  const executor = {
    insert(table: unknown) {
      return {
        values(values: Record<string, unknown>) {
          inserted.push({ table, values });
          return {
            onConflictDoNothing() {
              if (table === codexResearchProgress) {
                events.push("ensure-progress");
                return Promise.resolve(undefined);
              }
              events.push("schedule-season");
              return {
                returning: async () => options.scheduleRows ?? [{ seasonId: "2026-08" }],
              };
            },
          };
        },
      };
    },
    select() {
      return {
        from(table: unknown) {
          return {
            where(condition: SQL) {
              selects.push({ table, where: condition });
              let locked = false;
              const rows = table === codexResearchSeasons
                ? options.seasonRows ?? [seasonRow()]
                : options.progressRows ?? [progressRow()];
              const read = async () => {
                events.push(locked
                  ? table === codexResearchSeasons
                    ? "lock-season"
                    : "lock-progress"
                  : table === codexResearchSeasons
                    ? "read-season"
                    : "read-progress");
                return rows;
              };
              return {
                orderBy() {
                  return { limit: read };
                },
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
      return {
        set(values: Record<string, unknown>) {
          return {
            where(where: SQL) {
              updates.push({ table, values, where });
              return {
                returning: async () => table === codexResearchSeasons
                  ? options.activateRows ?? [{ seasonId: "2026-08" }]
                  : options.saveRows ?? [{ userId: "user-1" }],
              };
            },
          };
        },
      };
    },
  } as unknown as DbTransactionExecutor;
  return { executor, events, inserted, selects, updates };
}

describe("codex research repository", () => {
  it("keeps every monthly mutation on a transaction executor", () => {
    type GlobalDbIsTransactionExecutor = typeof db extends DbTransactionExecutor
      ? true
      : false;
    expectTypeOf<GlobalDbIsTransactionExecutor>().toEqualTypeOf<false>();
    expectTypeOf<Parameters<typeof scheduleCodexResearchSeason>[0]>()
      .toEqualTypeOf<DbTransactionExecutor>();
    expectTypeOf<Parameters<typeof lockCodexResearchProgress>[0]>()
      .toEqualTypeOf<DbTransactionExecutor>();
    expectTypeOf<Parameters<typeof saveCodexResearchProgress>[0]>()
      .toEqualTypeOf<DbTransactionExecutor>();
    expectTypeOf<Parameters<typeof activateCodexResearchSeason>[0]>()
      .toEqualTypeOf<DbTransactionExecutor>();
    expectTypeOf<Parameters<typeof lockCodexResearchSeasonForSettlement>[0]>()
      .toEqualTypeOf<DbTransactionExecutor>();
    expectTypeOf<Parameters<typeof markCodexResearchSeasonSettling>[0]>()
      .toEqualTypeOf<DbTransactionExecutor>();
    expectTypeOf<Parameters<typeof markCodexResearchSeasonResettling>[0]>()
      .toEqualTypeOf<DbTransactionExecutor>();
    expectTypeOf<Parameters<typeof writeCodexResearchFinalResults>[0]>()
      .toEqualTypeOf<DbTransactionExecutor>();
    expectTypeOf<Parameters<typeof closeCodexResearchSeason>[0]>()
      .toEqualTypeOf<DbTransactionExecutor>();
  });

  it("locks exactly one season before settlement and fails if it disappeared", async () => {
    const locked = fakeExecutor({
      seasonRows: [seasonRow({ status: "active" })],
    });

    await expect(lockCodexResearchSeasonForSettlement(
      locked.executor,
      "2026-08",
    )).resolves.toMatchObject({
      seasonId: "2026-08",
      status: "active",
    });
    expect(locked.events).toEqual(["lock-season"]);
    const query = new PgDialect().sqlToQuery(locked.selects[0].where);
    expect(query.params).toEqual(["2026-08"]);

    const missing = fakeExecutor({ seasonRows: [] });
    await expect(lockCodexResearchSeasonForSettlement(
      missing.executor,
      "2026-08",
    )).rejects.toThrow("season does not exist");
  });

  it("writes final results only between settling and closed season states", async () => {
    const fake = fakeExecutor();

    await markCodexResearchSeasonSettling(fake.executor, "2026-08", NOW);
    await writeCodexResearchFinalResults(
      fake.executor,
      "2026-08",
      [{ userId: "user-1", finalRank: 1, finalTier: "legendary" }],
      NOW,
    );
    await closeCodexResearchSeason(fake.executor, "2026-08", NOW);

    expect(fake.updates.map(({ table, values }) => ({ table, values })))
      .toEqual([
        {
          table: codexResearchSeasons,
          values: { status: "settling", updatedAt: NOW },
        },
        {
          table: codexResearchProgress,
          values: { finalRank: null, finalTier: null, updatedAt: NOW },
        },
        {
          table: codexResearchProgress,
          values: { finalRank: 1, finalTier: "legendary", updatedAt: NOW },
        },
        {
          table: codexResearchSeasons,
          values: { status: "closed", settledAt: NOW, updatedAt: NOW },
        },
      ]);
    expect(new PgDialect().sqlToQuery(fake.updates[0].where).params)
      .toEqual(["2026-08", "scheduled", "active", "settling"]);
    expect(new PgDialect().sqlToQuery(fake.updates[2].where).params)
      .toEqual(["user-1", "2026-08"]);
    expect(new PgDialect().sqlToQuery(fake.updates[3].where).params)
      .toEqual(["2026-08", "settling"]);
  });

  it("reopens only a closed season for correction and clears settledAt", async () => {
    const reopened = fakeExecutor();

    await markCodexResearchSeasonResettling(
      reopened.executor,
      "2026-08",
      NOW,
    );

    expect(reopened.updates[0]).toMatchObject({
      table: codexResearchSeasons,
      values: { status: "settling", settledAt: null, updatedAt: NOW },
    });
    expect(new PgDialect().sqlToQuery(reopened.updates[0].where).params)
      .toEqual(["2026-08", "closed"]);

    const missing = fakeExecutor({ activateRows: [] });
    await expect(markCodexResearchSeasonResettling(
      missing.executor,
      "2026-08",
      NOW,
    )).rejects.toThrow("was not marked resettling");
  });

  it("rejects duplicate final users or ranks before clearing stored results", async () => {
    const fake = fakeExecutor();

    await expect(writeCodexResearchFinalResults(
      fake.executor,
      "2026-08",
      [
        { userId: "user-1", finalRank: 1, finalTier: "legendary" },
        { userId: "user-2", finalRank: 1, finalTier: "diamond" },
      ],
      NOW,
    )).rejects.toThrow("final results are invalid");
    expect(fake.updates).toEqual([]);
  });

  it("maps a valid immutable season and rejects malformed stored definitions", () => {
    const row = seasonRow();
    const state = codexResearchSeasonRowToState(row);

    expect(state).toMatchObject({
      seasonId: "2026-08",
      themeId: "rivers-and-lakes",
      status: "scheduled",
    });
    expect(state.definition).toEqual(row.definitionSnapshot);
    expect(state.definition).not.toBe(row.definitionSnapshot);
    expect(() => codexResearchSeasonRowToState(seasonRow({
      endAt: NOW,
    }))).toThrow("season row is malformed");
    expect(() => codexResearchSeasonRowToState(seasonRow({
      status: "invented",
    }))).toThrow("season row is malformed");
  });

  it("fails closed on malformed persisted progress fields", () => {
    expect(codexResearchProgressRowToState(progressRow())).toEqual(
      emptyCodexResearchProgress(),
    );
    expect(() => codexResearchProgressRowToState(progressRow({ score: -1 })))
      .toThrow("progress row is malformed");
    expect(() => codexResearchProgressRowToState(progressRow({
      objectiveProgress: [],
    }))).toThrow("progress row is malformed");
    expect(() => codexResearchProgressRowToState(progressRow({
      finalRank: 0,
    }))).toThrow("progress row is malformed");
  });

  it("validates before scheduling and never overwrites an existing month", async () => {
    const invalid = definition();
    invalid.objectives[0].points += 1;
    const untouched = fakeExecutor();

    await expect(scheduleCodexResearchSeason(
      untouched.executor,
      invalid,
      NOW,
    )).rejects.toThrow("objective score budget");
    expect(untouched.inserted).toEqual([]);

    const duplicate = fakeExecutor({ scheduleRows: [] });
    await expect(scheduleCodexResearchSeason(
      duplicate.executor,
      definition(),
      NOW,
    )).rejects.toThrow("already exists");
    expect(duplicate.inserted[0]).toMatchObject({
      table: codexResearchSeasons,
      values: {
        seasonId: "2026-08",
        themeId: "rivers-and-lakes",
        status: "scheduled",
        startAt: new Date("2026-07-31T15:00:00.000Z"),
        endAt: new Date("2026-08-31T15:00:00.000Z"),
        createdAt: NOW,
        updatedAt: NOW,
      },
    });
  });

  it("reads at most two current reviewed seasons and rejects ambiguity", async () => {
    const current = fakeExecutor();
    await expect(readCurrentCodexResearchSeason(current.executor, NOW))
      .resolves.toMatchObject({ seasonId: "2026-08" });
    expect(current.events).toEqual(["read-season"]);
    const query = new PgDialect().sqlToQuery(current.selects[0].where);
    expect(query.sql).toContain('"codex_research_seasons"."status" in');
    expect(query.sql).toContain('"codex_research_seasons"."start_at" <=');
    expect(query.sql).toContain('"codex_research_seasons"."end_at" >');
    expect(query.params).toEqual([
      "scheduled",
      "active",
      NOW.toISOString(),
      NOW.toISOString(),
    ]);

    const missing = fakeExecutor({ seasonRows: [] });
    await expect(readCurrentCodexResearchSeason(missing.executor, NOW))
      .resolves.toBeNull();

    const ambiguous = fakeExecutor({ seasonRows: [seasonRow(), seasonRow()] });
    await expect(readCurrentCodexResearchSeason(ambiguous.executor, NOW))
      .rejects.toThrow("multiple current codex research seasons");
  });

  it("initializes then locks exactly one user-season progress row", async () => {
    const fake = fakeExecutor();

    await expect(lockCodexResearchProgress(
      fake.executor,
      "user-1",
      "2026-08",
      NOW,
    )).resolves.toEqual(emptyCodexResearchProgress());
    expect(fake.events).toEqual(["ensure-progress", "lock-progress"]);
    expect(fake.inserted[0]).toMatchObject({
      table: codexResearchProgress,
      values: {
        userId: "user-1",
        seasonId: "2026-08",
        score: 0,
        updatedAt: NOW,
      },
    });

    const missing = fakeExecutor({ progressRows: [] });
    await expect(lockCodexResearchProgress(
      missing.executor,
      "user-1",
      "2026-08",
      NOW,
    )).rejects.toThrow("progress row could not be locked");
  });

  it("targets both keys on save and fails if the locked row disappeared", async () => {
    const saved = fakeExecutor();
    const progress = emptyCodexResearchProgress();
    await expect(saveCodexResearchProgress(
      saved.executor,
      "user-1",
      "2026-08",
      progress,
      NOW,
    )).resolves.toBeUndefined();

    const update = saved.updates[0];
    expect(update.table).toBe(codexResearchProgress);
    expect(update.values).toMatchObject({
      score: 0,
      objectiveCompletedCount: 0,
      diversityScore: 0,
      recordScore: 0,
      updatedAt: NOW,
    });
    const query = new PgDialect().sqlToQuery(update.where);
    expect(query.sql).toContain('"codex_research_progress"."user_id"');
    expect(query.sql).toContain('"codex_research_progress"."season_id"');
    expect(query.params).toEqual(["user-1", "2026-08"]);

    const missing = fakeExecutor({ saveRows: [] });
    await expect(saveCodexResearchProgress(
      missing.executor,
      "user-1",
      "2026-08",
      progress,
      NOW,
    )).rejects.toThrow("progress row was not saved");
  });

  it("moves only a scheduled season to active and reports a lost row", async () => {
    const activated = fakeExecutor();
    await expect(activateCodexResearchSeason(
      activated.executor,
      "2026-08",
      NOW,
    )).resolves.toBeUndefined();
    expect(activated.updates[0]).toMatchObject({
      table: codexResearchSeasons,
      values: { status: "active", updatedAt: NOW },
    });
    const query = new PgDialect().sqlToQuery(activated.updates[0].where);
    expect(query.sql).toContain('"codex_research_seasons"."season_id"');
    expect(query.sql).toContain('"codex_research_seasons"."status"');
    expect(query.params).toEqual(["2026-08", "scheduled"]);

    const missing = fakeExecutor({ activateRows: [] });
    await expect(activateCodexResearchSeason(
      missing.executor,
      "2026-08",
      NOW,
    )).rejects.toThrow("season was not activated");

    const alreadyActive = fakeExecutor({
      activateRows: [],
      seasonRows: [seasonRow({ status: "active" })],
    });
    await expect(activateCodexResearchSeason(
      alreadyActive.executor,
      "2026-08",
      NOW,
    )).resolves.toBeUndefined();
  });
});
