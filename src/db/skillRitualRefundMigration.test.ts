import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.SKILL_RITUAL_MIGRATION_TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase("legacy skill ritual refund migration", () => {
  const schema = `skill_ritual_refund_${randomUUID().replaceAll("-", "")}`;
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: databaseUrl });
    await client.connect();
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);
    await client.query(`
      CREATE TABLE saves_kv (
        user_id text NOT NULL,
        key text NOT NULL,
        value jsonb NOT NULL,
        version integer NOT NULL DEFAULT 0,
        updated_at timestamp NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, key)
      )
    `);
  });

  afterAll(async () => {
    if (!client) return;
    await client.query(`DROP SCHEMA "${schema}" CASCADE`);
    await client.end();
  });

  it("기존 강화들을 전액 환급·초기화하고 다시 실행해도 중복 지급하지 않는다", async () => {
    const oldTimestamp = new Date("2026-08-01T00:00:00.000Z");
    await client.query(
      `INSERT INTO saves_kv (user_id, key, value, version, updated_at)
       VALUES
         ('u1', 'character.v2', $1::jsonb, 7, $4),
         ('u1', 'proficiency.v2', $2::jsonb, 9, $4),
         ('u1', 'skills.v2', $3::jsonb, 11, $4),
         ('u2', 'skills.v2', $5::jsonb, 3, $4),
         ('u3', 'skills.v2', $6::jsonb, 5, $4)`,
      [
        JSON.stringify({ gold: 50, bankedGold: 70 }),
        JSON.stringify({
          points: 10,
          groups: { warrior: { cumLevel: 149, cultivations: 0, tier: 1 } },
        }),
        JSON.stringify({
          learned: ["v2_skill_strike", "v2c_warrior_flurry"],
          equipped: ["v2_skill_strike"],
          enhancements: {
            v2_skill_strike: { mode: "power", level: 3 },
            v2c_warrior_flurry: 1,
          },
        }),
        oldTimestamp,
        JSON.stringify({
          learned: ["v2_skill_strike"],
          equipped: [],
          enhancements: {
            v2_skill_strike: { mode: "power", level: 5 },
          },
        }),
        JSON.stringify({ learned: [], equipped: [], enhancements: [] }),
      ],
    );

    const migration = await readFile(
      new URL("../../drizzle/0159_refund_legacy_skill_rituals.sql", import.meta.url),
      "utf8",
    );
    await client.query(migration);

    const firstRun = await client.query<{
      user_id: string;
      key: string;
      value: Record<string, unknown>;
      version: number;
      updated_at: Date;
    }>(
      "SELECT user_id, key, value, version, updated_at FROM saves_kv ORDER BY user_id, key",
    );

    expect(firstRun.rows).toEqual([
      {
        user_id: "u1",
        key: "character.v2",
        value: { gold: 13_000_050, bankedGold: 70 },
        version: 8,
        updated_at: expect.any(Date),
      },
      {
        user_id: "u1",
        key: "proficiency.v2",
        value: {
          points: 3_210,
          groups: { warrior: { cumLevel: 149, cultivations: 0, tier: 1 } },
        },
        version: 10,
        updated_at: expect.any(Date),
      },
      {
        user_id: "u1",
        key: "skills.v2",
        value: {
          learned: ["v2_skill_strike", "v2c_warrior_flurry"],
          equipped: ["v2_skill_strike"],
        },
        version: 12,
        updated_at: expect.any(Date),
      },
      {
        user_id: "u2",
        key: "character.v2",
        value: { gold: 82_000_000 },
        version: 1,
        updated_at: expect.any(Date),
      },
      {
        user_id: "u2",
        key: "proficiency.v2",
        value: { points: 15_900 },
        version: 1,
        updated_at: expect.any(Date),
      },
      {
        user_id: "u2",
        key: "skills.v2",
        value: { learned: ["v2_skill_strike"], equipped: [] },
        version: 4,
        updated_at: expect.any(Date),
      },
      {
        user_id: "u3",
        key: "skills.v2",
        value: { learned: [], equipped: [], enhancements: [] },
        version: 5,
        updated_at: oldTimestamp,
      },
    ]);
    for (const row of firstRun.rows.filter((row) => row.user_id !== "u3")) {
      expect(row.updated_at.getTime()).toBeGreaterThan(oldTimestamp.getTime());
    }

    await client.query(migration);
    const secondRun = await client.query(
      "SELECT user_id, key, value, version, updated_at FROM saves_kv ORDER BY user_id, key",
    );
    expect(secondRun.rows).toEqual(firstRun.rows);
  });
});
