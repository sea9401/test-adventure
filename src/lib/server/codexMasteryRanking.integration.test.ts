import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { readCodexMasteryRanking } from "./codexMasteryRanking";

const databaseUrl = process.env.CODEX_MASTERY_RANKING_TEST_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;

integration("codex mastery ranking PostgreSQL integration", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const executor = drizzle(pool);
  const prefix = `b5-ranking-${process.pid}`;
  const ids = {
    viewer: `${prefix}-viewer`,
    gold: `${prefix}-gold`,
    seals: `${prefix}-seals`,
    categories: `${prefix}-categories`,
    early: `${prefix}-early`,
    admin: `${prefix}-admin`,
    banned: `${prefix}-banned`,
    blocked: `${prefix}-blocked`,
  };

  beforeAll(async () => {
    const users = [
      [ids.viewer, `${prefix}-viewer@example.com`, "내연구가", null],
      [ids.gold, `${prefix}-gold@example.com`, "금연구가", null],
      [ids.seals, `${prefix}-seals@example.com`, "인장연구가", null],
      [ids.categories, `${prefix}-categories@example.com`, "분야연구가", null],
      [ids.early, `${prefix}-early@example.com`, "선착연구가", null],
      [ids.admin, `${prefix}-admin@example.com`, "관리연구가", null],
      [
        ids.banned,
        `${prefix}-banned@example.com`,
        "정지연구가",
        "2099-01-01T00:00:00.000Z",
      ],
      [ids.blocked, `${prefix}-blocked@example.com`, "차단연구가", null],
    ] as const;
    for (const [id, email, gameName, bannedUntil] of users) {
      await pool.query(
        `INSERT INTO users (id, email, game_name, banned_until)
         VALUES ($1, $2, $3, $4)`,
        [id, email, gameName, bannedUntil],
      );
    }

    const summaries = [
      [ids.gold, 100_000, 5, 0, 6, "2026-08-20T05:00:00.000Z"],
      [ids.seals, 100_000, 4, 9, 6, "2026-08-20T05:00:00.000Z"],
      [ids.categories, 100_000, 4, 8, 6, "2026-08-20T05:00:00.000Z"],
      [ids.early, 100_000, 4, 8, 5, "2026-08-20T04:00:00.000Z"],
      [ids.viewer, 100_000, 4, 8, 5, "2026-08-20T06:00:00.000Z"],
      [ids.admin, 999_000, 20, 20, 6, "2026-08-20T01:00:00.000Z"],
      [ids.banned, 998_000, 20, 20, 6, "2026-08-20T01:00:00.000Z"],
      [ids.blocked, 997_000, 20, 20, 6, "2026-08-20T01:00:00.000Z"],
    ] as const;
    for (const [userId, score, gold, seals, categories, reachedAt] of summaries) {
      await pool.query(
        `INSERT INTO codex_mastery_summary (
          user_id, total_score_milli, equipment_score_milli,
          gold_count, seal_count, scored_category_count, score_reached_at
        ) VALUES ($1, $2, $2, $3, $4, $5, $6)`,
        [userId, score, gold, seals, categories, reachedAt],
      );
    }
    await pool.query(
      `INSERT INTO user_blocks (
        blocker_user_id, blocked_user_id, blocked_name
      ) VALUES ($1, $2, $3)`,
      [ids.viewer, ids.blocked, "차단연구가"],
    );
  });

  afterAll(async () => {
    await pool.query("DELETE FROM users WHERE id LIKE $1", [`${prefix}%`]);
    await pool.end();
  });

  it("applies eligibility and every permanent tie-break before top/nearby slicing", async () => {
    const result = await readCodexMasteryRanking(executor, {
      viewerUserId: ids.viewer,
      scope: "overall",
      adminEmails: [`${prefix}-admin@example.com`],
      topLimit: 3,
      neighborRadius: 2,
    });

    expect(result.list.map((row) => [row.rank, row.name])).toEqual([
      [1, "금연구가"],
      [2, "인장연구가"],
      [3, "분야연구가"],
    ]);
    expect(result.nearby.map((row) => [row.rank, row.name])).toEqual([
      [3, "분야연구가"],
      [4, "선착연구가"],
      [5, "내연구가"],
    ]);
    expect(result.me).toMatchObject({ rank: 5, name: "내연구가", mine: true });
    expect([
      ...result.list.map((row) => row.name),
      ...result.nearby.map((row) => row.name),
    ]).not.toEqual(expect.arrayContaining([
      "관리연구가",
      "정지연구가",
      "차단연구가",
    ]));
  });

  it("requires a positive score in the selected category", async () => {
    const result = await readCodexMasteryRanking(executor, {
      viewerUserId: ids.viewer,
      scope: "fish",
      adminEmails: [`${prefix}-admin@example.com`],
    });

    expect(result).toEqual({ list: [], nearby: [], me: null });
  });
});
