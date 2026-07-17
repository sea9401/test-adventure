import { beforeEach, describe, expect, it, vi } from "vitest";

const { execute } = vi.hoisted(() => ({ execute: vi.fn() }));

vi.mock("@/db", () => ({ db: { execute } }));
vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-me"),
}));
vi.mock("@/lib/server/isAdmin", () => ({
  getAdminEmailsList: vi.fn(() => []),
}));

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("개인 랭킹", () => {
  it("프로필 아바타를 목록과 내 순위에 포함하고 구형 값을 정규화한다", async () => {
    execute.mockResolvedValueOnce({
      rows: [
        {
          user_id: "u-other",
          name: "다른모험가",
          avatar: "male2",
          level: 50,
          cum_level: 1200,
          paragon_exp: 0,
          fame: 100,
          battle_count: 500,
          rank: 1,
        },
        {
          user_id: "u-me",
          name: "내모험가",
          avatar: "female",
          level: 45,
          cum_level: 900,
          paragon_exp: 0,
          fame: 80,
          battle_count: 400,
          rank: 2,
        },
      ],
    });

    const response = await GET(
      new Request("http://localhost/api/rankings?metric=level"),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.list).toEqual([
      expect.objectContaining({ name: "다른모험가", avatar: "male2" }),
      expect.objectContaining({ name: "내모험가", avatar: "female1", mine: true }),
    ]);
    expect(json.me).toEqual(
      expect.objectContaining({ name: "내모험가", avatar: "female1" }),
    );
  });
});
