import { describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  CODEX_MASTERY_RANKING_SCOPES,
  isCodexMasteryRankingScope,
} from "@/adventure/data/v2/codexMasteryRanking";
import {
  readCodexMasteryRanking,
  type CodexMasteryRankingExecutor,
} from "./codexMasteryRanking";

function rawRow(overrides: Record<string, unknown> = {}) {
  return {
    user_id: "user-1",
    name: "연구가",
    avatar: "female2",
    character_save: null,
    rank: 1,
    is_top: true,
    score_milli: "12500",
    total_score_milli: "22500",
    equipment_score_milli: "1000",
    fish_score_milli: "2500",
    monster_score_milli: "3000",
    cooking_score_milli: "4000",
    life_score_milli: "5000",
    job_score_milli: "7000",
    bronze_count: 7,
    silver_count: 6,
    gold_count: 5,
    platinum_count: 4,
    diamond_count: 3,
    legendary_count: 2,
    seal_count: 8,
    scored_category_count: 6,
    ...overrides,
  };
}

function executorWithRows(rows: unknown[]) {
  const execute = vi.fn(async (_query: SQL) => ({ rows }));
  return {
    executor: { execute } as unknown as CodexMasteryRankingExecutor,
    execute,
  };
}

describe("codex mastery permanent ranking", () => {
  it("accepts only the seven permanent scopes", () => {
    expect(CODEX_MASTERY_RANKING_SCOPES).toEqual([
      "overall",
      "equipment",
      "fish",
      "monster",
      "cooking",
      "life",
      "job",
    ]);
    expect(isCodexMasteryRankingScope("overall")).toBe(true);
    expect(isCodexMasteryRankingScope("job")).toBe(true);
    expect(isCodexMasteryRankingScope("monthly")).toBe(false);
    expect(isCodexMasteryRankingScope(null)).toBe(false);
  });

  it.each([
    ["overall", "total_score_milli", "score_reached_at"],
    ["equipment", "equipment_score_milli", "equipment_score_reached_at"],
    ["fish", "fish_score_milli", "fish_score_reached_at"],
    ["monster", "monster_score_milli", "monster_score_reached_at"],
    ["cooking", "cooking_score_milli", "cooking_score_reached_at"],
    ["life", "life_score_milli", "life_score_reached_at"],
    ["job", "job_score_milli", "job_score_reached_at"],
  ] as const)("maps %s to its indexed score and reached-at columns", async (
    scope,
    scoreColumn,
    reachedAtColumn,
  ) => {
    const fake = executorWithRows([]);

    await readCodexMasteryRanking(fake.executor, {
      viewerUserId: "viewer-1",
      scope,
      adminEmails: ["ADMIN@EXAMPLE.COM"],
    });

    const query = new PgDialect().sqlToQuery(fake.execute.mock.calls[0][0]);
    expect(query.sql).toContain(`cm.${scoreColumn}`);
    expect(query.sql).toContain(`cm.${reachedAtColumn}`);
  });

  it("ranks eligible rows in the fixed tie-break order and bounds top/nearby selection", async () => {
    const fake = executorWithRows([]);

    await readCodexMasteryRanking(fake.executor, {
      viewerUserId: "viewer-1",
      scope: "overall",
      adminEmails: ["admin@example.com"],
      topLimit: 50,
      neighborRadius: 2,
    });

    const query = new PgDialect().sqlToQuery(fake.execute.mock.calls[0][0]);
    const normalized = query.sql.replace(/\s+/g, " ");
    expect(normalized).toContain(
      "ORDER BY score_milli DESC, gold_count DESC, seal_count DESC, scored_category_count DESC, score_reached_at ASC NULLS LAST, user_id ASC",
    );
    expect(normalized).toContain("score_milli > 0");
    expect(normalized).toContain("banned_until IS NULL");
    expect(normalized).toContain("NOT EXISTS");
    expect(normalized).toContain("user_blocks");
    expect(normalized).toContain("rank <=");
    expect(query.params).toContain("viewer-1");
    expect(query.params).toContain("admin@example.com");
    expect(query.params).toContain(50);
    expect(query.params).toContain(2);
  });

  it("normalizes bounded rows without exposing the stable user id", async () => {
    const fake = executorWithRows([
      rawRow(),
      rawRow({
        user_id: "viewer-1",
        name: "나",
        avatar: "invalid-avatar",
        rank: "52",
        is_top: false,
        score_milli: "10500",
      }),
      rawRow({
        user_id: "user-53",
        name: "이웃",
        rank: 53,
        is_top: false,
        score_milli: 9000,
      }),
    ]);

    const result = await readCodexMasteryRanking(fake.executor, {
      viewerUserId: "viewer-1",
      scope: "fish",
      adminEmails: [],
    });

    expect(result.list).toHaveLength(1);
    expect(result.nearby.map((row) => row.rank)).toEqual([52, 53]);
    expect(result.me).toMatchObject({
      rank: 52,
      name: "나",
      avatar: "male1",
      score: 11,
      totalScore: 23,
      categoryScores: {
        equipment: 1,
        fish: 3,
        monster: 3,
        cooking: 4,
        life: 5,
        job: 7,
      },
      goldOrHigherCount: 5,
      mine: true,
    });
    expect(result.me).not.toHaveProperty("userId");
    expect(result.me).not.toHaveProperty("user_id");
    expect(result.list[0]).toMatchObject({ mine: false });
  });

  it("rejects invalid persisted numeric values at the server boundary", async () => {
    const fake = executorWithRows([rawRow({ score_milli: "not-a-number" })]);

    await expect(readCodexMasteryRanking(fake.executor, {
      viewerUserId: "viewer-1",
      scope: "overall",
      adminEmails: [],
    })).rejects.toThrow("invalid codex mastery ranking row");
  });
});
