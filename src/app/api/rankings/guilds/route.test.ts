import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const { execute } = vi.hoisted(() => ({ execute: vi.fn() }));

vi.mock("@/db", () => ({ db: { execute } }));
vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-me"),
}));

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("길드 랭킹", () => {
  it("등록된 길드 엠블럼을 목록과 내 길드 순위에 포함한다", async () => {
    const emblem =
      "guild-emblems/3/123e4567-e89b-42d3-a456-426614174000.webp";
    execute
      .mockResolvedValueOnce({
        rows: [
          {
            guild_id: 3,
            name: "테스트길드",
            emblem,
            description: "함께 성장하는 길드",
            nation_name: "리베라",
            level: 2,
            fame_total: 50_000,
            member_count: 3,
            rank: 1,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ guild_id: 3 }] });

    const response = await GET();
    const json = await response.json();
    const rankingQuery = execute.mock.calls[0]?.[0] as SQL;
    const compiledRankingQuery = new PgDialect().sqlToQuery(rankingQuery);

    expect(response.status).toBe(200);
    expect(compiledRankingQuery.sql).toContain("g.is_test = false");
    expect(json.list).toEqual([
      expect.objectContaining({
        name: "테스트길드",
        guildId: 3,
        emblem,
        description: "함께 성장하는 길드",
        nationName: "리베라",
        level: 2,
        mine: true,
      }),
    ]);
    expect(json.list[0]).not.toHaveProperty("grade");
    expect(json.me).toEqual(
      expect.objectContaining({
        guildId: 3,
        name: "테스트길드",
        emblem,
        description: "함께 성장하는 길드",
        nationName: "리베라",
        level: 2,
      }),
    );
    expect(json.me).not.toHaveProperty("grade");
  });
});
