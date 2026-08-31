import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureUser: vi.fn(),
  rows: [] as Array<{ bracket: unknown }>,
}));

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: mocks.ensureUser,
}));

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => mocks.rows),
        })),
      })),
    })),
  },
}));

import { GET } from "./route";

const ctx = {
  params: Promise.resolve({ seasonId: "2026-W31", matchId: "match-1" }),
};

function bracket(replay: unknown, dishonoredUserIds: string[] = []) {
  return {
    version: 2,
    seasonId: "2026-W31",
    bracketSize: 8,
    minimumMatches: 10,
    generatedAt: new Date(0).toISOString(),
    startsAt: new Date(0).toISOString(),
    status: "in_progress",
    dishonoredUserIds,
    participants: [
      {
        userId: "p1",
        name: "모험가A",
        avatar: "female1",
        level: 100,
        qualifyingRank: 1,
        rating: 1500,
        matches: 10,
      },
      {
        userId: "p2",
        name: "모험가B",
        avatar: "male1",
        level: 100,
        qualifyingRank: 8,
        rating: 1400,
        matches: 10,
      },
    ],
    matches: [
      {
        id: "match-1",
        kind: "elimination",
        round: 1,
        roundName: "8강",
        slot: 1,
        sequence: 1,
        scheduledAt: new Date(0).toISOString(),
        status: "completed",
        p1SourceMatchId: null,
        p2SourceMatchId: null,
        p1SourceResult: "winner",
        p2SourceResult: "winner",
        p1UserId: "p1",
        p2UserId: "p2",
        p1Wins: 2,
        p2Wins: 0,
        winnerUserId: "p1",
        loserUserId: "p2",
        decidedBy: "wins",
        games: [
          {
            game: 1,
            outcome: "p1_win",
            turns: 10,
            p1HpRatio: 0.5,
            p2HpRatio: 0,
            replay,
          },
        ],
      },
    ],
    championUserId: null,
    rewards: [],
  };
}

describe("GET arena tournament match replay", () => {
  beforeEach(() => {
    mocks.ensureUser.mockReset();
    mocks.ensureUser.mockResolvedValue("viewer");
    mocks.rows = [];
  });

  it("과거 시즌의 완료된 경기 리플레이를 단건으로 반환한다", async () => {
    const replay = {
      enemy: { name: "모험가B", hp: 100 },
      playerMaxHp: 100,
      playerMaxMp: 0,
      log: [{ kind: "info", text: "전투 시작" }],
    };
    mocks.rows = [{ bracket: bracket(replay) }];

    const response = await GET(new Request("http://test"), ctx);

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.match).toMatchObject({
      roundName: "8강",
      p1: { name: "모험가A" },
      p2: { name: "모험가B" },
      games: [{ game: 1, replay }],
    });
  });

  it("로그가 없는 기존 경기는 찾을 수 없음으로 응답한다", async () => {
    mocks.rows = [{ bracket: bracket(undefined) }];

    const response = await GET(new Request("http://test"), ctx);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: "no_replay" });
  });

  it("불명예 참가자의 이름은 참가자 정보와 저장 리플레이에서 모두 가린다", async () => {
    const replay = {
      enemy: { name: "모험가B", hp: 100 },
      playerMaxHp: 100,
      playerMaxMp: 0,
      log: [
        { kind: "info", text: "모험가A와 모험가B의 전투가 시작되었다." },
        { kind: "enemy_attack", text: "모험가B의 공격!" },
      ],
    };
    mocks.rows = [{ bracket: bracket(replay, ["p2"]) }];

    const response = await GET(new Request("http://test"), ctx);

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.match.p2).toMatchObject({
      userId: "p2",
      name: "불명예 처리된 참가자",
      dishonored: true,
    });
    expect(json.match.p2.avatar).toBeUndefined();
    expect(JSON.stringify(json)).not.toContain("모험가B");
    expect(json.match).toMatchObject({
      p1Wins: 2,
      p2Wins: 0,
      winnerUserId: "p1",
    });
  });
});
