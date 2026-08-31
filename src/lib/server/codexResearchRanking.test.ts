import { describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { CodexResearchSeasonState } from "./codexResearchRepository";
import {
  readCodexResearchRankingForSeason,
  readCodexResearchRankingWithRuntime,
} from "./codexResearchRanking";

const NOW = new Date("2026-08-20T12:00:00.000Z");
const SEASON = {
  seasonId: "2026-08",
  themeId: "rivers-and-lakes",
  definition: { themeName: "강과 호수의 달" },
  startAt: new Date("2026-07-31T15:00:00.000Z"),
  endAt: new Date("2026-08-31T15:00:00.000Z"),
  status: "active",
  settledAt: null,
} as CodexResearchSeasonState;

function rawRow(overrides: Record<string, unknown> = {}) {
  return {
    user_id: "viewer",
    name: "내 연구자",
    avatar: "female2",
    character_save: {},
    rank: "2",
    is_top: true,
    score: 16_000,
    objective_completed_count: 10,
    diversity_score: 2_500,
    record_score: 1_500,
    ...overrides,
  };
}

function fakeExecutor(rows: unknown[]) {
  let query: SQL | null = null;
  return {
    executor: {
      async execute(value: SQL) {
        query = value;
        return { rows };
      },
    } as unknown as Parameters<typeof readCodexResearchRankingForSeason>[0],
    query: () => query,
  };
}

describe("monthly codex research ranking", () => {
  it("returns no-season without executing a ranking query", async () => {
    const execute = vi.fn();
    const runtime = { readCurrent: vi.fn(async () => null) };

    await expect(readCodexResearchRankingWithRuntime(
      runtime,
      { execute },
      {
        viewerUserId: "viewer",
        adminEmails: [],
        now: NOW,
      },
    )).resolves.toEqual({ status: "no_season" });
    expect(execute).not.toHaveBeenCalled();
  });

  it("ranks all eligible users before applying viewer blocks", async () => {
    const fake = fakeExecutor([
      rawRow(),
      rawRow({
        user_id: "neighbor",
        name: "옆 연구자",
        rank: 3,
        is_top: false,
        score: 15_000,
        objective_completed_count: 9,
      }),
    ]);

    const result = await readCodexResearchRankingForSeason(
      fake.executor,
      SEASON,
      {
        viewerUserId: "viewer",
        adminEmails: ["Admin@Example.com", "admin@example.com"],
        now: NOW,
        topLimit: 2,
        neighborRadius: 1,
      },
    );

    expect(result).toMatchObject({
      status: "active",
      seasonId: "2026-08",
      themeName: "강과 호수의 달",
      me: {
        rank: 2,
        score: 16_000,
        objectiveScore: 12_000,
        provisionalTier: "diamond",
        mine: true,
      },
    });
    expect(result.list).toHaveLength(1);
    expect(result.nearby.map((row) => row.rank)).toEqual([2, 3]);

    const query = new PgDialect().sqlToQuery(fake.query() as SQL);
    const normalized = query.sql.replace(/\s+/g, " ");
    expect(normalized.indexOf("ROW_NUMBER() OVER")).toBeLessThan(
      normalized.indexOf("FROM user_blocks"),
    );
    for (const token of [
      "score DESC",
      "objective_completed_count DESC",
      "diversity_score DESC",
      "record_score DESC",
      "score_reached_at ASC NULLS LAST",
      "user_id ASC",
    ]) {
      expect(normalized).toContain(token);
    }
    expect(normalized).toContain("banned_until");
    expect(query.params).toEqual(expect.arrayContaining([
      "2026-08",
      NOW,
      "admin@example.com",
      "viewer",
      2,
      1,
    ]));
  });

  it("rejects malformed rows rather than publishing partial ranks", async () => {
    const fake = fakeExecutor([rawRow({ diversity_score: 6_000 })]);

    await expect(readCodexResearchRankingForSeason(
      fake.executor,
      SEASON,
      { viewerUserId: "viewer", adminEmails: [], now: NOW },
    )).rejects.toThrow("invalid monthly codex ranking row");
  });
});
