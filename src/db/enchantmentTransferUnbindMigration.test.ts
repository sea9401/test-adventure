import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.ENCHANTMENT_UNBIND_MIGRATION_TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase("enchantment transfer source unbind migration", () => {
  const schema = `enchantment_unbind_${randomUUID().replaceAll("-", "")}`;
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

  it("마법부여 없이 귀속만 남은 장비만 귀속을 풀고 재실행해도 다시 갱신하지 않는다", async () => {
    const oldTimestamp = new Date("2026-09-01T00:00:00.000Z");
    const liberation = { rank: 2, lineCount: 1, revision: 3, options: [{ id: "physical_attack_flat", level: 7 }] };
    await client.query(
      `INSERT INTO saves_kv (user_id, key, value, version, updated_at)
       VALUES
         ('u1', 'equipment.v2', $1::jsonb, 3, $4),
         ('u2', 'equipment.v2', $2::jsonb, 5, $4),
         ('u3', 'character.v2', $3::jsonb, 7, $4)`,
      [
        JSON.stringify({
          owned: [
            { iid: "source", id: "v2_storm_breaker_greatsword", bound: true, locked: true, liberationRevision: 4 },
            { iid: "target", id: "v2_storm_breaker_greatsword", bound: true, liberation, liberationRevision: 3 },
            { iid: "plain", id: "v2_iron_sword" },
          ],
          equipped: { weapon: "target" },
        }),
        JSON.stringify({
          owned: [{ iid: "enchanted", id: "v2_storm_breaker_greatsword", bound: true, liberation }],
          equipped: {},
        }),
        JSON.stringify({ bound: true, gold: 10 }),
        oldTimestamp,
      ],
    );

    const migration = await readFile(
      new URL("../../drizzle/0188_unbind_enchantment_transfer_sources.sql", import.meta.url),
      "utf8",
    );
    await client.query(migration);

    const firstRun = await client.query<{ user_id: string; value: unknown; version: number; updated_at: Date }>(
      "SELECT user_id, value, version, updated_at FROM saves_kv ORDER BY user_id",
    );
    expect(firstRun.rows.map(({ user_id, value, version }) => ({ user_id, value, version }))).toEqual([
      {
        user_id: "u1",
        value: {
          owned: [
            { iid: "source", id: "v2_storm_breaker_greatsword", locked: true, liberationRevision: 4 },
            { iid: "target", id: "v2_storm_breaker_greatsword", bound: true, liberation, liberationRevision: 3 },
            { iid: "plain", id: "v2_iron_sword" },
          ],
          equipped: { weapon: "target" },
        },
        version: 4,
      },
      {
        user_id: "u2",
        value: { owned: [{ iid: "enchanted", id: "v2_storm_breaker_greatsword", bound: true, liberation }], equipped: {} },
        version: 5,
      },
      { user_id: "u3", value: { bound: true, gold: 10 }, version: 7 },
    ]);
    expect(firstRun.rows[0].updated_at.getTime()).toBeGreaterThan(oldTimestamp.getTime());
    expect(firstRun.rows[1].updated_at.getTime()).toBe(oldTimestamp.getTime());

    await client.query(migration);
    const secondRun = await client.query<{ version: number }>("SELECT version FROM saves_kv ORDER BY user_id");
    expect(secondRun.rows.map(({ version }) => version)).toEqual([4, 5, 7]);
  });
});
