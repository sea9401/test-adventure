import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCodexMasteryCatalog } from "@/adventure/data/v2/codexMasteryCatalog";
import type { CodexMasteryEntryDefinition } from "@/adventure/data/v2/codexMasteryTypes";
import * as databaseSchema from "@/db/schema";
import {
  codexMasteryProgress,
  codexMasterySummary,
  codexTrophyHistory,
} from "@/db/schema";
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
    ]) {
      const migration = await readFile(
        new URL(`../../../drizzle/${migrationName}`, import.meta.url),
        "utf8",
      );
      const isolatedMigration = migration.replaceAll(
        '"public"."users"',
        `"${isolatedSchema}"."users"`,
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
});
