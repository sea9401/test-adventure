import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.COOKING_FIRST_DISCOVERY_MIGRATION_TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase("cooking first discovery keep-on-delete migration", () => {
  const schema = `cooking_first_${randomUUID().replaceAll("-", "")}`;
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: databaseUrl });
    await client.connect();
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);
    await client.query(`
      CREATE TABLE users (id text PRIMARY KEY);
      CREATE TABLE saves_kv (
        user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        key text NOT NULL,
        value jsonb NOT NULL,
        version integer NOT NULL DEFAULT 0,
        updated_at timestamp NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, key)
      );
      CREATE TABLE cooking_first_discoveries (
        recipe_id text PRIMARY KEY,
        user_id text NOT NULL,
        actor_name text NOT NULL,
        discovered_at timestamp NOT NULL DEFAULT now(),
        CONSTRAINT cooking_first_discoveries_user_id_users_id_fk
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      INSERT INTO users (id) VALUES ('holder-a'), ('holder-b'), ('discoverer'), ('broken');
      INSERT INTO cooking_first_discoveries (recipe_id, user_id, actor_name, discovered_at)
      VALUES ('known_recipe', 'discoverer', '포르말린', '2026-11-03 15:57:34');
      INSERT INTO saves_kv (user_id, key, value, updated_at) VALUES
        ('holder-a', 'cooking.v2', '{"discoveredRecipeIds":["rustic_bread","herb_tea","grilled_corn","fish_skewer","herb_flatbread","country_egg_bread","lost_recipe","known_recipe"]}', '2026-10-28 00:00:00'),
        ('holder-b', 'cooking.v2', '{"discoveredRecipeIds":["lost_recipe"]}', '2026-10-25 16:34:05'),
        ('broken', 'cooking.v2', '{"discoveredRecipeIds":"lost_recipe"}', '2026-01-01 00:00:00'),
        ('discoverer', 'character.v2', '{"discoveredRecipeIds":["other_save_recipe"]}', '2026-01-01 00:00:00');
    `);
    const migration = await readFile(
      new URL("../../drizzle/0193_cooking_first_discovery_keep_on_user_delete.sql", import.meta.url),
      "utf8",
    );
    // 격리 스키마의 users를 참조하도록 스키마 한정자만 뺀다.
    await client.query(migration.replaceAll('"public"."users"', '"users"'));
  });

  afterAll(async () => {
    if (!client) return;
    await client.query(`DROP SCHEMA "${schema}" CASCADE`);
    await client.end();
  });

  async function rows() {
    const result = await client.query<{
      recipe_id: string;
      user_id: string | null;
      actor_name: string;
      discovered_at: Date;
    }>("SELECT recipe_id, user_id, actor_name, discovered_at::text AS discovered_at FROM cooking_first_discoveries ORDER BY recipe_id");
    return result.rows;
  }

  it("도감에 남았지만 기록이 사라진 요리만 가장 이른 세이브 시각으로 복구한다", async () => {
    expect(await rows()).toEqual([
      {
        recipe_id: "known_recipe",
        user_id: "discoverer",
        actor_name: "포르말린",
        discovered_at: "2026-11-03 15:57:34",
      },
      {
        recipe_id: "lost_recipe",
        user_id: null,
        actor_name: "탈퇴한 사용자",
        discovered_at: "2026-10-25 16:34:05",
      },
    ]);
  });

  it("발견자를 삭제해도 기록을 남기고 참조만 비운다", async () => {
    await client.query("DELETE FROM users WHERE id = 'discoverer'");

    expect(await rows()).toContainEqual(expect.objectContaining({
      recipe_id: "known_recipe",
      user_id: null,
    }));
  });
});
