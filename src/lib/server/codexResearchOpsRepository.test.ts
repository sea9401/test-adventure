import { describe, expect, it } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { DbExecutor } from "./savesKv";
import {
  codexResearchSeasonOpsRowToSummary,
  countCodexResearchSeasonTrophies,
  readCodexResearchSeasonForOps,
  readCodexResearchSeasonOpsList,
} from "./codexResearchOpsRepository";

const NOW = new Date("2026-10-01T00:00:00.000Z");

function rawRow(overrides: Record<string, unknown> = {}) {
  return {
    season_id: "2026-09",
    theme_id: "rivers-and-lakes",
    theme_name: "강과 호수의 달",
    definition_version: "1",
    start_at_ms: String(new Date("2026-08-31T15:00:00.000Z").getTime()),
    end_at_ms: String(new Date("2026-09-30T15:00:00.000Z").getTime()),
    status: "closed",
    settled_at_ms: String(new Date("2026-09-30T16:00:00.000Z").getTime()),
    published_at_ms: String(new Date("2026-09-30T17:00:00.000Z").getTime()),
    progress_count: "12",
    scored_count: "10",
    final_rank_count: "10",
    bronze_count: "1",
    silver_count: "2",
    gold_count: "2",
    platinum_count: "1",
    diamond_count: "3",
    legendary_count: "1",
    trophy_count: "10",
    ...overrides,
  };
}

function executeFake(rows: unknown[]) {
  const queries: SQL[] = [];
  const executor = {
    execute(query: SQL) {
      queries.push(query);
      return Promise.resolve({ rows });
    },
  } as unknown as Pick<DbExecutor, "execute">;
  return { executor, queries };
}

describe("codex research operations repository", () => {
  it("returns null when an individually requested season does not exist", async () => {
    const executor = {
      select() {
        return {
          from() {
            return {
              where() {
                return { limit: async () => [] };
              },
            };
          },
        };
      },
    } as unknown as DbExecutor;

    await expect(readCodexResearchSeasonForOps(executor, "2026-09"))
      .resolves.toBeNull();
  });

  it("parses bounded aggregate counts and derives deterministic states", async () => {
    const fake = executeFake([
      rawRow(),
      rawRow({
        season_id: "2026-10",
        start_at_ms: String(new Date("2026-09-30T15:00:00.000Z").getTime()),
        end_at_ms: String(new Date("2026-10-31T15:00:00.000Z").getTime()),
        status: "active",
        settled_at_ms: null,
        published_at_ms: null,
        progress_count: 2,
        scored_count: 1,
        final_rank_count: 0,
        bronze_count: 0,
        silver_count: 0,
        gold_count: 0,
        platinum_count: 0,
        diamond_count: 0,
        legendary_count: 0,
        trophy_count: 0,
      }),
    ]);

    await expect(readCodexResearchSeasonOpsList(fake.executor, NOW, 24))
      .resolves.toMatchObject([
        {
          seasonId: "2026-09",
          status: "closed",
          publishedAt: "2026-09-30T17:00:00.000Z",
          opsState: "closed",
          counts: {
            progress: 12,
            scored: 10,
            finalRanked: 10,
            trophies: 10,
          },
        },
        {
          seasonId: "2026-10",
          status: "active",
          opsState: "too_early",
        },
      ]);
    const query = new PgDialect().sqlToQuery(fake.queries[0]);
    expect(query.params.at(-1)).toBe(24);
    expect(query.sql).toContain("codex_research_progress");
    expect(query.sql).toContain("codex_trophy_history");
  });

  it("marks impossible persisted aggregates inconsistent and rejects bad counts", () => {
    expect(codexResearchSeasonOpsRowToSummary(rawRow({
      scored_count: 3,
      final_rank_count: 0,
      bronze_count: 0,
      silver_count: 0,
      gold_count: 0,
      platinum_count: 0,
      diamond_count: 0,
      legendary_count: 0,
      trophy_count: 0,
    }), NOW).opsState).toBe("inconsistent");
    expect(codexResearchSeasonOpsRowToSummary(rawRow({
      trophy_count: 11,
    }), NOW).opsState).toBe("inconsistent");
    expect(codexResearchSeasonOpsRowToSummary(rawRow({
      status: "active",
      settled_at_ms: null,
      published_at_ms: String(NOW.getTime()),
      final_rank_count: 0,
      bronze_count: 0,
      silver_count: 0,
      gold_count: 0,
      platinum_count: 0,
      diamond_count: 0,
      legendary_count: 0,
      trophy_count: 0,
    }), NOW).opsState).toBe("inconsistent");
    expect(() => codexResearchSeasonOpsRowToSummary(rawRow({
      progress_count: -1,
    }), NOW)).toThrow("operations row is malformed");
  });

  it("counts only the exact research season trophy family", async () => {
    const fake = executeFake([{ trophy_count: "7" }]);

    await expect(countCodexResearchSeasonTrophies(fake.executor, "2026-09"))
      .resolves.toBe(7);
    const query = new PgDialect().sqlToQuery(fake.queries[0]);
    expect(query.sql).toContain("trophy_kind = 'research_season'");
    expect(query.params).toEqual(["research:2026-09"]);
  });
});
