import { beforeEach, describe, expect, it, vi } from "vitest";

const { execute } = vi.hoisted(() => ({ execute: vi.fn() }));

vi.mock("@/db", () => ({ db: { execute } }));
vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-me"),
}));
vi.mock("@/lib/server/isAdmin", () => ({
  getAdminEmailsList: vi.fn(() => []),
}));
vi.mock("@/lib/server/museunCosmetics", () => ({
  readMuseunCosmeticAppearanceMap: vi.fn(async () => new Map()),
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

  it("낚시 점수 대신 네 생활 레벨 합계로 순위를 매긴다", async () => {
    execute.mockResolvedValueOnce({
      rows: [
        {
          user_id: "u-me",
          name: "생활초보",
          avatar: "female1",
          farm_save: { stats: { farmingXp: 10 } },
          woodcutting_save: { cuts: 1, xp: 10 },
          mining_save: { successes: 1, xp: 10 },
          fishing_save: { xp: 10 },
          updated_at: "2026-07-20T00:00:00.000Z",
        },
        {
          user_id: "u-life",
          name: "생활장인",
          avatar: "male1",
          farm_save: { stats: { farmingXp: 500 } },
          woodcutting_save: { cuts: 50, xp: 500 },
          mining_save: { successes: 50, xp: 500 },
          fishing_save: { xp: 500 },
          updated_at: "2026-07-20T00:00:01.000Z",
        },
      ],
    });

    const response = await GET(
      new Request("http://localhost/api/rankings?metric=lifeMastery"),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.list.map((entry: { name: string }) => entry.name)).toEqual([
      "생활장인",
      "생활초보",
    ]);
    expect(json.list[0].lifeMastery).toBeGreaterThan(
      json.list[1].lifeMastery,
    );
  });

  it("직업·장비·어보 수집 수로 도감 완성도 순위를 매긴다", async () => {
    execute.mockResolvedValueOnce({
      rows: [
        {
          user_id: "u-me",
          name: "수집초보",
          avatar: "female1",
          character_save: { class: "warrior" },
          proficiency_save: { groups: { warrior: { cumLevel: 1 } } },
          farm_save: {},
          woodcutting_save: {},
          quests_save: {},
          equipment_codex_save: {},
          fishing_codex_save: {},
          updated_at: "2026-07-20T00:00:00.000Z",
        },
        {
          user_id: "u-codex",
          name: "수집장인",
          avatar: "male1",
          character_save: { class: "warrior" },
          proficiency_save: { groups: { warrior: { cumLevel: 1 } } },
          farm_save: {},
          woodcutting_save: {},
          quests_save: {},
          equipment_codex_save: { registeredIds: ["v2_iron_sword"] },
          fishing_codex_save: {
            fish: {
              carp: { discovered: true, bestSize: 40, totalCaught: 1 },
            },
          },
          updated_at: "2026-07-20T00:00:01.000Z",
        },
      ],
    });

    const response = await GET(
      new Request("http://localhost/api/rankings?metric=codexCompletion"),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.list[0]).toEqual(
      expect.objectContaining({
        name: "수집장인",
        codexCollected: expect.any(Number),
        codexTotal: expect.any(Number),
      }),
    );
    expect(json.list[0].codexCollected).toBeGreaterThan(
      json.list[1].codexCollected,
    );
  });

  it("숙련의 탑은 일일 기록이 아닌 역대 최고층으로 정렬한다", async () => {
    execute.mockResolvedValueOnce({
      rows: [
        {
          user_id: "u-me",
          name: "오늘의도전자",
          avatar: "female1",
          tower_save: { todayBestFloor: 40, lifetimeBestFloor: 12 },
          updated_at: "2026-07-20T00:00:00.000Z",
        },
        {
          user_id: "u-tower",
          name: "탑의기록자",
          avatar: "male1",
          tower_save: { todayBestFloor: 1, lifetimeBestFloor: 35 },
          updated_at: "2026-07-20T00:00:01.000Z",
        },
      ],
    });

    const response = await GET(
      new Request("http://localhost/api/rankings?metric=masteryTower"),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.list.map((entry: { name: string }) => entry.name)).toEqual([
      "탑의기록자",
      "오늘의도전자",
    ]);
    expect(json.list.map((entry: { masteryTowerFloor: number }) => entry.masteryTowerFloor)).toEqual([
      35,
      12,
    ]);
  });

  it("달성 조건과 수령 기록을 합산해 업적 점수 순위를 매긴다", async () => {
    execute.mockResolvedValueOnce({
      rows: [
        {
          user_id: "u-me",
          name: "전투업적가",
          avatar: "female1",
          character_save: {},
          proficiency_save: {},
          adventure_save: { monsters: { slime: { kills: 100 } } },
          equipment_save: {},
          skills_save: {},
          crafting_save: {},
          farm_save: {},
          woodcutting_save: {},
          mining_save: {},
          fishing_save: {},
          equipment_codex_save: {},
          tower_save: {},
          grid_history_save: [],
          quests_save: {},
          fishing_codex_save: {},
          arena_wins: 0,
          arena_matches: 0,
          siege_attempts: 0,
          siege_wins: 0,
          has_guild: false,
          has_traded: false,
          has_outpost: false,
          updated_at: "2026-07-20T00:00:00.000Z",
        },
        {
          user_id: "u-achievement",
          name: "업적수집가",
          avatar: "male1",
          character_save: {},
          proficiency_save: {},
          adventure_save: {},
          equipment_save: {},
          skills_save: {},
          crafting_save: {},
          farm_save: {},
          woodcutting_save: {},
          mining_save: {},
          fishing_save: {},
          equipment_codex_save: {},
          tower_save: {},
          grid_history_save: [],
          quests_save: { claimed: ["gold_1m"] },
          fishing_codex_save: {},
          arena_wins: 0,
          arena_matches: 0,
          siege_attempts: 0,
          siege_wins: 0,
          has_guild: false,
          has_traded: false,
          has_outpost: false,
          updated_at: "2026-07-20T00:00:01.000Z",
        },
      ],
    });

    const response = await GET(
      new Request("http://localhost/api/rankings?metric=achievementScore"),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.list.map((entry: { name: string }) => entry.name)).toEqual([
      "업적수집가",
      "전투업적가",
    ]);
    expect(json.list[0]).toEqual(
      expect.objectContaining({ achievementScore: 40, achievementCompleted: 1 }),
    );
    expect(json.me).toEqual(
      expect.objectContaining({ achievementScore: 20, achievementCompleted: 3 }),
    );
  });

  it("제거된 낚시 점수 지표는 더 이상 제공하지 않는다", async () => {
    const response = await GET(
      new Request("http://localhost/api/rankings?metric=fishingScore"),
    );

    expect(response.status).toBe(400);
    expect(execute).not.toHaveBeenCalled();
  });
});
