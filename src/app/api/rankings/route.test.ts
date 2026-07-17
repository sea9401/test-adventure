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

  it("캐릭터 화면과 같은 공식으로 전투력을 계산해 내림차순 정렬한다", async () => {
    execute.mockResolvedValueOnce({
      rows: [
        {
          user_id: "u-me",
          name: "초보모험가",
          avatar: "female1",
          character_save: { level: 1 },
          equipment_save: {},
          proficiency_save: {},
          skills_save: {},
          updated_at: "2026-07-17T00:00:00.000Z",
        },
        {
          user_id: "u-strong",
          name: "강한모험가",
          avatar: "male1",
          character_save: { level: 30 },
          equipment_save: {},
          proficiency_save: {},
          skills_save: {},
          updated_at: "2026-07-17T00:00:01.000Z",
        },
      ],
    });

    const response = await GET(
      new Request("http://localhost/api/rankings?metric=combatPower"),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.list.map((entry: { name: string }) => entry.name)).toEqual([
      "강한모험가",
      "초보모험가",
    ]);
    expect(json.list[0].combatPower).toBeGreaterThan(json.list[1].combatPower);
    expect(json.me).toEqual(
      expect.objectContaining({
        name: "초보모험가",
        combatPower: json.list[1].combatPower,
      }),
    );
  });

  it("제거된 전투 횟수 지표는 더 이상 제공하지 않는다", async () => {
    const response = await GET(
      new Request("http://localhost/api/rankings?metric=battleCount"),
    );

    expect(response.status).toBe(400);
    expect(execute).not.toHaveBeenCalled();
  });
});
