import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { and, asc, eq, inArray } from "drizzle-orm";
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
  codexResearchPublications,
  codexResearchSeasons,
  codexTrophyHistory,
  serverFeed,
  v2Notifications,
} from "@/db/schema";
import { scheduleCodexResearchSeason } from "./codexResearchRepository";
import { readCodexResearchArchive } from "./codexResearchArchive";
import { publishCodexResearchSeasonHonors } from "./codexResearchPublication";
import {
  previewCodexResearchSettlementForOps,
  resettleCodexResearchSeason,
  scheduleCodexResearchSeasonForOps,
} from "./codexResearchOps";
import { readCodexResearchSeasonOpsList } from "./codexResearchOpsRepository";
import { recordCodexResearchGameplayBatch } from "./codexResearchService";
import { settleCodexResearchSeason } from "./codexResearchSettlement";
import {
  awardCodexResearchSeasonTrophies,
  readCodexResearchTrophyHistory,
} from "./codexResearchTrophies";
import { readCodexMasteryTrophyHistory } from "./codexMasteryTrophyRepository";
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

function researchDefinition(
  seasonId = "2026-08",
): CodexResearchDefinitionSnapshot {
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
    seasonId,
    themeId: `postgres-rivers-${seasonId}`,
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
    await admin.query(`
      CREATE TABLE users (
        id text PRIMARY KEY,
        email text,
        game_name text,
        banned_until timestamp
      )
    `);
    await admin.query(`
      CREATE TABLE saves_kv (
        user_id text NOT NULL,
        key text NOT NULL,
        value jsonb NOT NULL,
        PRIMARY KEY (user_id, key)
      )
    `);
    await admin.query(`
      CREATE TABLE user_blocks (
        blocker_user_id text NOT NULL,
        blocked_user_id text NOT NULL,
        PRIMARY KEY (blocker_user_id, blocked_user_id)
      )
    `);
    await admin.query(`
      CREATE TABLE v2_notifications (
        id serial PRIMARY KEY,
        user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type text NOT NULL,
        payload jsonb NOT NULL,
        read_at timestamp,
        created_at timestamp DEFAULT now() NOT NULL
      )
    `);
    await admin.query(`
      CREATE TABLE server_feed (
        id serial PRIMARY KEY,
        user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        actor_name text NOT NULL,
        type text NOT NULL,
        payload jsonb NOT NULL,
        created_at timestamp DEFAULT now() NOT NULL
      )
    `);

    for (const migrationName of [
      "0171_codex_mastery_foundation.sql",
      "0172_codex_mastery_trophy_history.sql",
      "0173_wandering_scrambler.sql",
      "0174_codex_research_settlement.sql",
      "0175_codex_research_publication.sql",
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

  it("serializes monthly settlement and rolls final ranks back with its transaction", async () => {
    const settledDefinition = researchDefinition("2026-09");
    const userIds = Array.from(
      { length: 12 },
      (_, index) => `settlement-user-${String(index + 1).padStart(2, "0")}`,
    );
    for (const [index, userId] of userIds.entries()) {
      await admin.query(
        "INSERT INTO users (id, email, game_name) VALUES ($1, $2, $3)",
        [userId, `${userId}@example.com`, `연구자 ${index + 1}`],
      );
    }
    await database.transaction((tx) => scheduleCodexResearchSeason(
      tx,
      settledDefinition,
      new Date("2026-08-20T00:00:00.000Z"),
    ));
    await database.insert(codexResearchProgress).values(userIds.map(
      (userId, index) => ({
        userId,
        seasonId: settledDefinition.seasonId,
        score: 18_000,
        objectiveProgress: {
          objectives: {},
          diversityEntries: {},
          recordValues: {},
        },
        objectiveCompletedCount: 18,
        diversityScore: 3_000,
        recordScore: 3_000,
        scoreReachedAt: new Date(`2026-09-20T00:00:${String(index).padStart(2, "0")}.000Z`),
        representativeRecord: null,
        updatedAt: new Date("2026-09-20T00:01:00.000Z"),
      }),
    ));
    const settlementInput = {
      seasonId: settledDefinition.seasonId,
      now: new Date("2026-09-30T15:00:00.000Z"),
      adminEmails: [] as string[],
    };

    const results = await Promise.all([
      database.transaction((tx) => settleCodexResearchSeason(tx, settlementInput)),
      database.transaction((tx) => settleCodexResearchSeason(tx, settlementInput)),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([
      "already_closed",
      "settled",
    ]);
    const finals = await database
      .select({
        userId: codexResearchProgress.userId,
        finalRank: codexResearchProgress.finalRank,
        finalTier: codexResearchProgress.finalTier,
      })
      .from(codexResearchProgress)
      .where(eq(codexResearchProgress.seasonId, settledDefinition.seasonId))
      .orderBy(asc(codexResearchProgress.finalRank));
    expect(finals.map(({ finalRank }) => finalRank)).toEqual(
      Array.from({ length: 12 }, (_, index) => index + 1),
    );
    expect(finals.slice(0, 3).every(({ finalTier }) => finalTier === "legendary"))
      .toBe(true);
    expect(finals.slice(3, 10).every(({ finalTier }) => finalTier === "diamond"))
      .toBe(true);
    expect(finals.slice(10).every(({ finalTier }) => finalTier === "platinum"))
      .toBe(true);

    const firstAward = await database.transaction((tx) =>
      awardCodexResearchSeasonTrophies(tx, settledDefinition.seasonId)
    );
    const repeatedAward = await database.transaction((tx) =>
      awardCodexResearchSeasonTrophies(tx, settledDefinition.seasonId)
    );
    expect(firstAward).toMatchObject({
      eligibleCount: 12,
      createdCount: 12,
      existingCount: 0,
    });
    expect(repeatedAward).toMatchObject({
      eligibleCount: 12,
      createdCount: 0,
      existingCount: 12,
    });
    expect(await database
      .select()
      .from(codexTrophyHistory)
      .where(eq(codexTrophyHistory.trophyKind, "research_season")))
      .toHaveLength(12);
    expect(await readCodexMasteryTrophyHistory(database, userIds[0])).toEqual([]);
    expect(await readCodexResearchTrophyHistory(database, userIds[0]))
      .toEqual([expect.objectContaining({
        trophyId: "research:2026-09",
        currentTier: "legendary",
        seasonMetadata: expect.objectContaining({ finalRank: 1, score: 18_000 }),
      })]);

    const rollbackDefinition = researchDefinition("2026-10");
    const rollbackUserId = "settlement-rollback-user";
    await admin.query(
      "INSERT INTO users (id, email, game_name) VALUES ($1, $2, $3)",
      [rollbackUserId, "settlement-rollback@example.com", "롤백 연구자"],
    );
    await database.transaction((tx) => scheduleCodexResearchSeason(
      tx,
      rollbackDefinition,
      new Date("2026-09-20T00:00:00.000Z"),
    ));
    await database.insert(codexResearchProgress).values({
      userId: rollbackUserId,
      seasonId: rollbackDefinition.seasonId,
      score: 4_000,
      objectiveProgress: { objectives: {}, diversityEntries: {}, recordValues: {} },
      objectiveCompletedCount: 1,
      diversityScore: 0,
      recordScore: 0,
      scoreReachedAt: new Date("2026-10-20T00:00:00.000Z"),
      representativeRecord: null,
      updatedAt: new Date("2026-10-20T00:00:00.000Z"),
    });
    await expect(database.transaction(async (tx) => {
      await settleCodexResearchSeason(tx, {
        seasonId: rollbackDefinition.seasonId,
        now: new Date("2026-10-31T15:00:00.000Z"),
        adminEmails: [],
      });
      throw new Error("settlement rollback sentinel");
    })).rejects.toThrow("settlement rollback sentinel");
    const [rolledBackSeason] = await database
      .select()
      .from(codexResearchSeasons)
      .where(eq(codexResearchSeasons.seasonId, rollbackDefinition.seasonId));
    const [rolledBackProgress] = await database
      .select()
      .from(codexResearchProgress)
      .where(eq(codexResearchProgress.seasonId, rollbackDefinition.seasonId));
    expect(rolledBackSeason).toMatchObject({ status: "scheduled", settledAt: null });
    expect(rolledBackProgress).toMatchObject({ finalRank: null, finalTier: null });
  }, 30_000);

  it("operates preview, correction, publication guards, and aggregates end to end", async () => {
    const futureDefinition = researchDefinition("2027-01");
    await expect(database.transaction((tx) =>
      scheduleCodexResearchSeasonForOps(tx, {
        definition: futureDefinition,
        now: new Date("2026-08-20T00:00:00.000Z"),
      })
    )).resolves.toMatchObject({
      seasonId: "2027-01",
      status: "scheduled",
    });
    const futureSummary = (await readCodexResearchSeasonOpsList(
      database,
      new Date("2026-08-20T00:00:00.000Z"),
      24,
    )).find((row) => row.seasonId === futureDefinition.seasonId);
    expect(futureSummary).toMatchObject({
      opsState: "too_early",
      counts: { progress: 0, scored: 0, finalRanked: 0, trophies: 0 },
    });

    const correctionDefinition = researchDefinition("2026-11");
    const users = ["ops-correction-a", "ops-correction-b"];
    await admin.query(
      "INSERT INTO users (id, email, game_name) VALUES ($1, $2, $3), ($4, $5, $6)",
      [
        users[0],
        "ops-correction-a@example.com",
        "재결산 연구자 A",
        users[1],
        "ops-correction-b@example.com",
        "재결산 연구자 B",
      ],
    );
    await database.transaction((tx) => scheduleCodexResearchSeasonForOps(tx, {
      definition: correctionDefinition,
      now: new Date("2026-10-20T00:00:00.000Z"),
    }));
    await database.insert(codexResearchProgress).values([
      {
        userId: users[0],
        seasonId: correctionDefinition.seasonId,
        score: 18_000,
        objectiveProgress: { objectives: {}, diversityEntries: {}, recordValues: {} },
        objectiveCompletedCount: 18,
        diversityScore: 3_000,
        recordScore: 3_000,
        scoreReachedAt: new Date("2026-11-20T00:00:00.000Z"),
        representativeRecord: null,
        updatedAt: new Date("2026-11-20T00:00:00.000Z"),
      },
      {
        userId: users[1],
        seasonId: correctionDefinition.seasonId,
        score: 16_000,
        objectiveProgress: { objectives: {}, diversityEntries: {}, recordValues: {} },
        objectiveCompletedCount: 16,
        diversityScore: 2_000,
        recordScore: 2_000,
        scoreReachedAt: new Date("2026-11-20T00:00:01.000Z"),
        representativeRecord: null,
        updatedAt: new Date("2026-11-20T00:00:01.000Z"),
      },
    ]);
    const endedAt = new Date("2026-11-30T15:00:00.000Z");
    await expect(previewCodexResearchSettlementForOps(database, {
      seasonId: correctionDefinition.seasonId,
      adminEmails: [],
      now: endedAt,
    })).resolves.toMatchObject({
      participantCount: 2,
      top: [
        { userId: users[0], rank: 1, tier: "legendary" },
        { userId: users[1], rank: 2, tier: "diamond" },
      ],
    });
    expect(await database
      .select({ finalRank: codexResearchProgress.finalRank })
      .from(codexResearchProgress)
      .where(eq(codexResearchProgress.seasonId, correctionDefinition.seasonId)))
      .toEqual([{ finalRank: null }, { finalRank: null }]);

    await database.transaction((tx) => settleCodexResearchSeason(tx, {
      seasonId: correctionDefinition.seasonId,
      adminEmails: [],
      now: endedAt,
    }));
    await database
      .update(codexResearchProgress)
      .set({
        score: 4_000,
        objectiveCompletedCount: 1,
        diversityScore: 0,
        recordScore: 0,
        scoreReachedAt: new Date("2026-11-29T00:00:00.000Z"),
      })
      .where(and(
        eq(codexResearchProgress.seasonId, correctionDefinition.seasonId),
        eq(codexResearchProgress.userId, users[0]),
      ));
    await expect(database.transaction((tx) => resettleCodexResearchSeason(tx, {
      seasonId: correctionDefinition.seasonId,
      adminEmails: [],
      now: new Date("2026-11-30T16:00:00.000Z"),
    }))).resolves.toMatchObject({
      status: "resettled",
      participantCount: 2,
      tierCounts: { bronze: 1, diamond: 1 },
    });
    const corrected = await database
      .select({
        userId: codexResearchProgress.userId,
        score: codexResearchProgress.score,
        finalRank: codexResearchProgress.finalRank,
        finalTier: codexResearchProgress.finalTier,
      })
      .from(codexResearchProgress)
      .where(eq(codexResearchProgress.seasonId, correctionDefinition.seasonId))
      .orderBy(asc(codexResearchProgress.finalRank));
    expect(corrected).toEqual([
      { userId: users[1], score: 16_000, finalRank: 1, finalTier: "diamond" },
      { userId: users[0], score: 4_000, finalRank: 2, finalTier: "bronze" },
    ]);
    const [correctedSeason] = await database
      .select()
      .from(codexResearchSeasons)
      .where(eq(codexResearchSeasons.seasonId, correctionDefinition.seasonId));

    await expect(database.transaction(async (tx) => {
      await tx
        .update(codexResearchProgress)
        .set({
          score: 19_000,
          objectiveCompletedCount: 18,
          diversityScore: 4_000,
          recordScore: 3_000,
          scoreReachedAt: new Date("2026-11-29T01:00:00.000Z"),
        })
        .where(and(
          eq(codexResearchProgress.seasonId, correctionDefinition.seasonId),
          eq(codexResearchProgress.userId, users[0]),
        ));
      await resettleCodexResearchSeason(tx, {
        seasonId: correctionDefinition.seasonId,
        adminEmails: [],
        now: new Date("2026-11-30T17:00:00.000Z"),
      });
      throw new Error("resettlement rollback sentinel");
    })).rejects.toThrow("resettlement rollback sentinel");
    const afterRollback = await database
      .select({
        userId: codexResearchProgress.userId,
        score: codexResearchProgress.score,
        finalRank: codexResearchProgress.finalRank,
        finalTier: codexResearchProgress.finalTier,
      })
      .from(codexResearchProgress)
      .where(eq(codexResearchProgress.seasonId, correctionDefinition.seasonId))
      .orderBy(asc(codexResearchProgress.finalRank));
    const [seasonAfterRollback] = await database
      .select()
      .from(codexResearchSeasons)
      .where(eq(codexResearchSeasons.seasonId, correctionDefinition.seasonId));
    expect(afterRollback).toEqual(corrected);
    expect(seasonAfterRollback).toMatchObject({
      status: "closed",
      settledAt: correctedSeason.settledAt,
    });

    await expect(database.transaction((tx) =>
      awardCodexResearchSeasonTrophies(tx, correctionDefinition.seasonId)
    )).resolves.toMatchObject({ createdCount: 2, existingCount: 0 });
    await expect(database.transaction((tx) => resettleCodexResearchSeason(tx, {
      seasonId: correctionDefinition.seasonId,
      adminEmails: [],
      now: new Date("2026-11-30T18:00:00.000Z"),
    }))).rejects.toMatchObject({ code: "trophies_already_published" });

    await expect(readCodexResearchArchive(database, {
      viewerUserId: users[0],
      seasonId: correctionDefinition.seasonId,
      now: new Date("2026-11-30T18:01:00.000Z"),
    })).resolves.toMatchObject({ status: "no_season" });

    await expect(database.transaction(async (tx) => {
      await publishCodexResearchSeasonHonors(tx, {
        seasonId: correctionDefinition.seasonId,
        now: new Date("2026-11-30T18:02:00.000Z"),
        feedEnabled: false,
      });
      throw new Error("publication rollback sentinel");
    })).rejects.toThrow("publication rollback sentinel");
    expect(await database.select().from(codexResearchPublications).where(
      eq(codexResearchPublications.seasonId, correctionDefinition.seasonId),
    )).toEqual([]);
    expect(await database.select().from(v2Notifications).where(
      inArray(v2Notifications.userId, users),
    )).toEqual([]);
    const [unpublishedAfterRollback] = await database.select().from(
      codexResearchSeasons,
    ).where(eq(codexResearchSeasons.seasonId, correctionDefinition.seasonId));
    expect(unpublishedAfterRollback.publishedAt).toBeNull();

    await expect(database.transaction((tx) =>
      publishCodexResearchSeasonHonors(tx, {
        seasonId: correctionDefinition.seasonId,
        now: new Date("2026-11-30T18:03:00.000Z"),
        feedEnabled: false,
      })
    )).resolves.toMatchObject({
      notificationCreatedCount: 2,
      notificationExistingCount: 0,
      feedCreatedCount: 0,
    });
    expect(await database.select().from(v2Notifications).where(
      inArray(v2Notifications.userId, users),
    )).toHaveLength(2);
    expect(await database.select().from(serverFeed).where(
      inArray(serverFeed.userId, users),
    )).toHaveLength(0);
    await expect(readCodexResearchArchive(database, {
      viewerUserId: users[0],
      seasonId: correctionDefinition.seasonId,
      now: new Date("2026-11-30T18:04:00.000Z"),
    })).resolves.toMatchObject({
      status: "ready",
      selectedSeasonId: correctionDefinition.seasonId,
      list: [
        { rank: 1, finalTier: "diamond", firstPlaceEngraving: true },
        { rank: 2, finalTier: "bronze", firstPlaceEngraving: false },
      ],
    });

    await expect(database.transaction((tx) =>
      publishCodexResearchSeasonHonors(tx, {
        seasonId: correctionDefinition.seasonId,
        now: new Date("2026-11-30T18:05:00.000Z"),
        feedEnabled: true,
      })
    )).resolves.toMatchObject({
      notificationCreatedCount: 0,
      notificationExistingCount: 2,
      feedCreatedCount: 1,
      feedExistingCount: 0,
    });
    await expect(database.transaction((tx) =>
      publishCodexResearchSeasonHonors(tx, {
        seasonId: correctionDefinition.seasonId,
        now: new Date("2026-11-30T18:06:00.000Z"),
        feedEnabled: true,
      })
    )).resolves.toMatchObject({
      notificationCreatedCount: 0,
      notificationExistingCount: 2,
      feedCreatedCount: 0,
      feedExistingCount: 1,
    });
    expect(await database.select().from(v2Notifications).where(
      inArray(v2Notifications.userId, users),
    )).toHaveLength(2);
    expect(await database.select().from(serverFeed).where(
      inArray(serverFeed.userId, users),
    )).toHaveLength(1);
    await expect(database.transaction((tx) => resettleCodexResearchSeason(tx, {
      seasonId: correctionDefinition.seasonId,
      adminEmails: [],
      now: new Date("2026-11-30T18:07:00.000Z"),
    }))).rejects.toMatchObject({ code: "season_already_published" });

    const publishedSummary = (await readCodexResearchSeasonOpsList(
      database,
      new Date("2026-11-30T18:00:00.000Z"),
      24,
    )).find((row) => row.seasonId === correctionDefinition.seasonId);
    expect(publishedSummary).toMatchObject({
      opsState: "closed",
      publishedAt: "2026-11-30T18:03:00.000Z",
      counts: {
        progress: 2,
        scored: 2,
        finalRanked: 2,
        trophies: 2,
      },
    });
  }, 30_000);
});
