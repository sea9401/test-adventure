import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCodexMasteryCatalog } from "@/adventure/data/v2/codexMasteryCatalog";
import type { CodexMasteryEntryDefinition } from "@/adventure/data/v2/codexMasteryTypes";
import type {
  CodexResearchDefinitionSnapshot,
  CodexResearchObjective,
} from "@/adventure/data/v2/codexResearch";
import * as databaseSchema from "@/db/schema";
import {
  codexMasteryProgress,
  codexMasterySummary,
  codexResearchProgress,
  codexResearchSeasons,
  codexTrophyHistory,
} from "@/db/schema";
import { scheduleCodexResearchSeason } from "./codexResearchRepository";
import { recordCodexResearchGameplayBatch } from "./codexResearchService";
import { recordCodexMastery } from "./codexMasteryService";

const databaseUrl = process.env.CODEX_MASTERY_POSTGRES_TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

const FISH: CodexMasteryEntryDefinition = {
  category: "fish",
  entryId: "fish:postgres-carp",
  label: "PostgreSQL carp",
  thresholds: {
    bronze: 5,
    silver: 30,
    gold: 150,
    platinum: 500,
    diamond: 1_500,
    legendary: 5_000,
  },
  scoreWeightMilli: 1_000,
  seals: {},
};
const CATALOG = createCodexMasteryCatalog([FISH]);
const ENABLED = {
  recordingEnabled: true,
  sealsEnabled: true,
  trophiesEnabled: false,
};

function researchDefinition(): CodexResearchDefinitionSnapshot {
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
    themeId: "postgres-rivers",
    themeName: "PostgreSQL 강과 호수의 달",
    primaryCategories: ["fish", "life"],
    supportCategory: "cooking",
    objectives: groups.flatMap(([group, count, points]) =>
      Array.from({ length: count }, (_, index) => ({
        id: `${group}-${index + 1}`,
        group,
        label: `${group} ${index + 1}`,
        description: "PostgreSQL integration objective",
        points,
        filter: {
          category: "fish" as const,
          entryIds: [`fish-${group}-${index + 1}`],
          sources: ["fishing.catch" as const],
        },
        rule: { kind: "count" as const, target: 3 },
      }))
    ),
    diversityTracks: [
      {
        id: "fish-variety",
        label: "fish variety",
        filter: { category: "fish", sources: ["fishing.catch"] },
        pointsPerEntry: 300,
        maxEntries: 10,
      },
      {
        id: "life-variety",
        label: "life variety",
        filter: { category: "life", sources: ["life.complete"] },
        pointsPerEntry: 200,
        maxEntries: 10,
      },
    ],
    recordTracks: [
      {
        id: "fish-record",
        label: "fish record",
        filter: { category: "fish", sources: ["fishing.catch"] },
        milestones: [{ value: 10, score: 1_500 }],
      },
      {
        id: "rare-record",
        label: "rare record",
        filter: {
          category: "fish",
          entryIds: ["rare-fish"],
          sources: ["fishing.catch"],
        },
        milestones: [{ value: 10, score: 1_500 }],
      },
    ],
  };
}

describeWithDatabase("codex mastery PostgreSQL transaction integration", () => {
  const isolatedSchema = `codex_mastery_${randomUUID().replaceAll("-", "")}`;
  let admin: Client;
  let pool: Pool;
  let database: ReturnType<typeof drizzle<typeof databaseSchema>>;

  beforeAll(async () => {
    admin = new Client({ connectionString: databaseUrl });
    await admin.connect();
    await admin.query(`CREATE SCHEMA "${isolatedSchema}"`);
    await admin.query(`SET search_path TO "${isolatedSchema}"`);
    await admin.query("CREATE TABLE users (id text PRIMARY KEY)");

    for (const migrationName of [
      "0169_codex_mastery_foundation.sql",
      "0170_codex_mastery_trophy_history.sql",
      "0171_wandering_scrambler.sql",
    ]) {
      const migration = await readFile(
        new URL(`../../../drizzle/${migrationName}`, import.meta.url),
        "utf8",
      );
      const isolatedMigration = migration.replaceAll(
        '"public".',
        `"${isolatedSchema}".`,
      );
      for (const statement of isolatedMigration.split("--> statement-breakpoint")) {
        if (statement.trim()) await admin.query(statement);
      }
    }

    pool = new Pool({
      connectionString: databaseUrl,
      max: 4,
      options: `-c search_path=${isolatedSchema}`,
    });
    database = drizzle(pool, { schema: databaseSchema });
  }, 30_000);

  afterAll(async () => {
    if (pool) await pool.end();
    if (!admin) return;
    await admin.query("SET search_path TO public");
    await admin.query(`DROP SCHEMA "${isolatedSchema}" CASCADE`);
    await admin.end();
  }, 30_000);

  it("serializes concurrent increments without losing progress", async () => {
    // Break caught: callers bypass the shared transaction/summary lock and lose an increment.
    const userId = "concurrent-user";
    await admin.query("INSERT INTO users (id) VALUES ($1)", [userId]);
    const input = {
      userId,
      category: "fish" as const,
      entryId: FISH.entryId,
      mutation: { amount: 1 },
      source: "fishing.catch" as const,
    };

    await Promise.all([
      database.transaction((tx) => recordCodexMastery(
        tx,
        CATALOG,
        input,
        ENABLED,
        new Date("2026-08-20T00:00:00.000Z"),
      )),
      database.transaction((tx) => recordCodexMastery(
        tx,
        CATALOG,
        input,
        ENABLED,
        new Date("2026-08-20T00:00:01.000Z"),
      )),
    ]);

    const [progress] = await database
      .select()
      .from(codexMasteryProgress)
      .where(eq(codexMasteryProgress.userId, userId));
    const [summary] = await database
      .select()
      .from(codexMasterySummary)
      .where(eq(codexMasterySummary.userId, userId));
    expect(progress).toMatchObject({ count: 2, scoreMilli: 1_000 });
    expect(summary).toMatchObject({
      totalScoreMilli: 1_000,
      fishScoreMilli: 1_000,
      scoredCategoryCount: 1,
    });
  }, 30_000);

  it("rolls back progress and summary writes with the caller transaction", async () => {
    // Break caught: mastery persists outside the caller transaction after later gameplay failure.
    const userId = "rollback-user";
    await admin.query("INSERT INTO users (id) VALUES ($1)", [userId]);
    const input = {
      userId,
      category: "fish" as const,
      entryId: FISH.entryId,
      mutation: { amount: 1 },
      source: "fishing.catch" as const,
    };
    await database.transaction((tx) => recordCodexMastery(
      tx,
      CATALOG,
      input,
      ENABLED,
      new Date("2026-08-20T00:00:00.000Z"),
    ));

    await expect(database.transaction(async (tx) => {
      await recordCodexMastery(
        tx,
        CATALOG,
        { ...input, mutation: { amount: 4 } },
        ENABLED,
        new Date("2026-08-20T01:00:00.000Z"),
      );
      throw new Error("rollback sentinel");
    })).rejects.toThrow("rollback sentinel");

    const [progress] = await database
      .select()
      .from(codexMasteryProgress)
      .where(eq(codexMasteryProgress.userId, userId));
    const [summary] = await database
      .select()
      .from(codexMasterySummary)
      .where(eq(codexMasterySummary.userId, userId));
    expect(progress).toMatchObject({
      count: 1,
      currentTier: "discovered",
      scoreMilli: 1_000,
    });
    expect(summary).toMatchObject({
      totalScoreMilli: 1_000,
      fishScoreMilli: 1_000,
      bronzeCount: 0,
    });
    expect(await database
      .select()
      .from(codexTrophyHistory)
      .where(eq(codexTrophyHistory.userId, userId))).toEqual([]);
  }, 30_000);

  it("commits a trophy promotion with the progress and summary", async () => {
    const userId = "trophy-user";
    await admin.query("INSERT INTO users (id) VALUES ($1)", [userId]);

    const result = await database.transaction((tx) => recordCodexMastery(
      tx,
      CATALOG,
      {
        userId,
        category: "fish",
        entryId: FISH.entryId,
        mutation: { amount: 5 },
        source: "fishing.catch",
      },
      { ...ENABLED, trophiesEnabled: true },
      new Date("2026-08-20T02:00:00.000Z"),
    ));

    expect(result).toMatchObject({
      recorded: true,
      newTrophyPromotions: [{
        trophyId: "mastery:fish",
        tier: "bronze",
      }],
    });
    expect(await database
      .select({
        trophyId: codexTrophyHistory.trophyId,
        currentTier: codexTrophyHistory.currentTier,
        tierAchievedAt: codexTrophyHistory.tierAchievedAt,
      })
      .from(codexTrophyHistory)
      .where(eq(codexTrophyHistory.userId, userId))).toEqual([{
        trophyId: "mastery:fish",
        currentTier: "bronze",
        tierAchievedAt: {
          bronze: "2026-08-20T02:00:00.000Z",
        },
      }]);
  }, 30_000);

  it("serializes monthly progress and excludes the exact season end", async () => {
    const definition = researchDefinition();
    const concurrentUserId = "monthly-concurrent-user";
    const endedUserId = "monthly-ended-user";
    await admin.query("INSERT INTO users (id) VALUES ($1), ($2)", [
      concurrentUserId,
      endedUserId,
    ]);
    await database.transaction((tx) => scheduleCodexResearchSeason(
      tx,
      definition,
      new Date("2026-07-20T00:00:00.000Z"),
    ));
    const event = {
      category: "fish" as const,
      entryId: "fish-basic-1",
      amount: 1,
      bestValue: 12,
      source: "fishing.catch" as const,
    };

    await Promise.all([
      database.transaction((tx) => recordCodexResearchGameplayBatch(
        tx,
        concurrentUserId,
        [event],
        new Date("2026-08-20T00:00:00.000Z"),
      )),
      database.transaction((tx) => recordCodexResearchGameplayBatch(
        tx,
        concurrentUserId,
        [event],
        new Date("2026-08-20T00:00:01.000Z"),
      )),
    ]);

    const [progress] = await database
      .select()
      .from(codexResearchProgress)
      .where(eq(codexResearchProgress.userId, concurrentUserId));
    const [storedSeason] = await database
      .select()
      .from(codexResearchSeasons)
      .where(eq(codexResearchSeasons.seasonId, definition.seasonId));
    expect(progress).toMatchObject({
      seasonId: "2026-08",
      score: 1_800,
      objectiveCompletedCount: 0,
      diversityScore: 300,
      recordScore: 1_500,
    });
    expect(progress.objectiveProgress.objectives["basic-1"]).toMatchObject({
      value: 2,
    });
    expect(progress.score).toBeLessThanOrEqual(20_000);
    expect(storedSeason.status).toBe("active");

    await expect(database.transaction((tx) =>
      recordCodexResearchGameplayBatch(
        tx,
        endedUserId,
        [event],
        new Date("2026-08-31T15:00:00.000Z"),
      )
    )).resolves.toEqual({
      recorded: false,
      reason: "no_active_season",
    });
    expect(await database
      .select()
      .from(codexResearchProgress)
      .where(eq(codexResearchProgress.userId, endedUserId))).toEqual([]);
  }, 30_000);
});
