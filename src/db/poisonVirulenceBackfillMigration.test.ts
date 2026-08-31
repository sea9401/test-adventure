import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.POISON_VIRULENCE_MIGRATION_TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase("poison virulence learned-skill backfill migration", () => {
  const schema = `poison_virulence_${randomUUID().replaceAll("-", "")}`;
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

  it("기존 부식 보유자에게 대응 맹독만 학습 지급하고 재실행해도 중복하지 않는다", async () => {
    const oldTimestamp = new Date("2026-08-01T00:00:00.000Z");
    await client.query(
      `INSERT INTO saves_kv (user_id, key, value, version, updated_at)
       VALUES
         ('u1', 'skills.v2', $1::jsonb, 3, $6),
         ('u2', 'skills.v2', $2::jsonb, 5, $6),
         ('u3', 'skills.v2', $3::jsonb, 7, $6),
         ('u4', 'skills.v2', $4::jsonb, 9, $6),
         ('u5', 'character.v2', $5::jsonb, 11, $6)`,
      [
        JSON.stringify({
          learned: ["v2c_venomist_corrosion", "v2_skill_strike"],
          equipped: ["v2c_venomist_corrosion"],
          favoriteSkills: ["v2c_venomist_corrosion"],
        }),
        JSON.stringify({
          learned: [
            "v2c_venomist_corrosion",
            "v2c_venomancer_corrosion3",
            "v2c_venomlord_sovereign",
            "v2c_plaguebringer_decay",
            "v2c_venomancer_virulence2",
          ],
          equipped: ["v2c_plaguebringer_decay"],
          loadoutPresets: [{ name: "부식", skills: ["v2c_plaguebringer_decay"] }],
        }),
        JSON.stringify({ learned: ["v2_skill_strike"], equipped: [] }),
        JSON.stringify({ learned: { broken: true }, equipped: [] }),
        JSON.stringify({ level: 100, gold: 10 }),
        oldTimestamp,
      ],
    );

    const migration = await readFile(
      new URL(
        "../../drizzle/0161_backfill_poison_virulence_skills.sql",
        import.meta.url,
      ),
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
        key: "skills.v2",
        value: {
          learned: [
            "v2c_venomist_corrosion",
            "v2_skill_strike",
            "v2c_venomist_virulence",
          ],
          equipped: ["v2c_venomist_corrosion"],
          favoriteSkills: ["v2c_venomist_corrosion"],
        },
        version: 4,
        updated_at: expect.any(Date),
      },
      {
        user_id: "u2",
        key: "skills.v2",
        value: {
          learned: [
            "v2c_venomist_corrosion",
            "v2c_venomancer_corrosion3",
            "v2c_venomlord_sovereign",
            "v2c_plaguebringer_decay",
            "v2c_venomancer_virulence2",
            "v2c_venomist_virulence",
            "v2c_venomlord_virulence3",
            "v2c_plaguebringer_virulence4",
          ],
          equipped: ["v2c_plaguebringer_decay"],
          loadoutPresets: [
            { name: "부식", skills: ["v2c_plaguebringer_decay"] },
          ],
        },
        version: 6,
        updated_at: expect.any(Date),
      },
      {
        user_id: "u3",
        key: "skills.v2",
        value: { learned: ["v2_skill_strike"], equipped: [] },
        version: 7,
        updated_at: oldTimestamp,
      },
      {
        user_id: "u4",
        key: "skills.v2",
        value: { learned: { broken: true }, equipped: [] },
        version: 9,
        updated_at: oldTimestamp,
      },
      {
        user_id: "u5",
        key: "character.v2",
        value: { level: 100, gold: 10 },
        version: 11,
        updated_at: oldTimestamp,
      },
    ]);
    expect(firstRun.rows[0].updated_at.getTime()).toBeGreaterThan(
      oldTimestamp.getTime(),
    );
    expect(firstRun.rows[1].updated_at.getTime()).toBeGreaterThan(
      oldTimestamp.getTime(),
    );

    await client.query(migration);
    const secondRun = await client.query(
      "SELECT user_id, key, value, version, updated_at FROM saves_kv ORDER BY user_id, key",
    );
    expect(secondRun.rows).toEqual(firstRun.rows);
  });
});
