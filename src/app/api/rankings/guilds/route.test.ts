import { beforeEach, describe, expect, it, vi } from "vitest";

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

    expect(response.status).toBe(200);
    expect(json.list).toEqual([
      expect.objectContaining({
        name: "테스트길드",
        emblem,
        level: 2,
        mine: true,
      }),
    ]);
    expect(json.list[0]).not.toHaveProperty("grade");
    expect(json.me).toEqual(
      expect.objectContaining({ name: "테스트길드", emblem, level: 2 }),
    );
    expect(json.me).not.toHaveProperty("grade");
  });
});
