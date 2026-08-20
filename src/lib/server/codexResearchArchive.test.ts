import { describe, expect, it } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  readCodexResearchArchive,
  type CodexResearchArchiveExecutor,
} from "./codexResearchArchive";

const NOW = new Date("2026-09-02T00:00:00.000Z");

function seasonRow(overrides: Record<string, unknown> = {}) {
  return {
    season_id: "2026-08",
    theme_id: "rivers-and-lakes",
    theme_name: "강과 호수의 달",
    start_at_ms: String(new Date("2026-07-31T15:00:00.000Z").getTime()),
    end_at_ms: String(new Date("2026-08-31T15:00:00.000Z").getTime()),
    settled_at_ms: String(new Date("2026-08-31T16:00:00.000Z").getTime()),
    published_at_ms: String(new Date("2026-08-31T17:00:00.000Z").getTime()),
    participant_count: "3",
    trophy_count: "2",
    ...overrides,
  };
}

function rankingRow(overrides: Record<string, unknown> = {}) {
  return {
    user_id: "viewer",
    name: "내 연구자",
    avatar: "female2",
    character_save: {},
    rank: "7",
    final_tier: "gold",
    is_top: false,
    score: "13000",
    objective_completed_count: "10",
    diversity_score: "2000",
    record_score: "1000",
    ...overrides,
  };
}

function fakeExecutor(results: unknown[][]) {
  const queries: SQL[] = [];
  let index = 0;
  return {
    executor: {
      async execute(query: SQL) {
        queries.push(query);
        return { rows: results[index++] ?? [] };
      },
    } as CodexResearchArchiveExecutor,
    queries,
  };
}

describe("codex research archive repository", () => {
  it("returns no season without a ranking read when none is published", async () => {
    const fake = fakeExecutor([[]]);

    await expect(readCodexResearchArchive(fake.executor, {
      viewerUserId: "viewer",
      now: NOW,
    })).resolves.toEqual({ status: "no_season", seasons: [] });
    expect(fake.queries).toHaveLength(1);
    const query = new PgDialect().sqlToQuery(fake.queries[0]);
    expect(query.sql).toContain("status = 'closed'");
    expect(query.sql).toContain("published_at IS NOT NULL");
  });

  it("uses stored final ranks and preserves gaps after visibility filtering", async () => {
    const fake = fakeExecutor([[
      seasonRow(),
      seasonRow({
        season_id: "2026-07",
        start_at_ms: String(new Date("2026-06-30T15:00:00.000Z").getTime()),
        end_at_ms: String(new Date("2026-07-31T15:00:00.000Z").getTime()),
        settled_at_ms: String(new Date("2026-07-31T16:00:00.000Z").getTime()),
        published_at_ms: String(new Date("2026-07-31T17:00:00.000Z").getTime()),
      }),
    ], [
      rankingRow({ user_id: "top", name: "우승자", rank: 1, is_top: true, final_tier: "legendary", score: 19_000, objective_completed_count: 18, diversity_score: 5_000, record_score: 3_000 }),
      rankingRow(),
      rankingRow({ user_id: "neighbor", name: "이웃", rank: 9, final_tier: "silver", score: 9_000, objective_completed_count: 8 }),
    ]]);

    const result = await readCodexResearchArchive(fake.executor, {
      viewerUserId: "viewer",
      seasonId: "2026-08",
      now: NOW,
      topLimit: 1,
      neighborRadius: 2,
    });

    expect(result).toMatchObject({
      status: "ready",
      selectedSeasonId: "2026-08",
      list: [{ rank: 1, finalTier: "legendary", firstPlaceEngraving: true }],
      nearby: [{ rank: 7, mine: true }, { rank: 9 }],
      me: { rank: 7, finalTier: "gold" },
    });
    const rankingQuery = new PgDialect().sqlToQuery(fake.queries[1]);
    expect(rankingQuery.sql).not.toContain("ROW_NUMBER");
    expect(rankingQuery.sql).toContain("final_rank");
    expect(rankingQuery.sql).toContain("user_blocks");
    expect(rankingQuery.params).toEqual(expect.arrayContaining([
      "2026-08",
      "viewer",
      1,
      2,
    ]));
  });

  it("fails closed on malformed stored final results", async () => {
    const fake = fakeExecutor([[seasonRow()], [rankingRow({ final_tier: "mythic" })]]);

    await expect(readCodexResearchArchive(fake.executor, {
      viewerUserId: "viewer",
      now: NOW,
    })).rejects.toThrow("invalid codex research archive row");
  });
});
