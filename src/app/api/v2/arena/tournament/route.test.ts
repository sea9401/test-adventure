import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureUser: vi.fn(),
  getOrCreateCurrentSeason: vi.fn(),
  ensureArenaTournament: vi.fn(),
  latestArenaTournament: vi.fn(),
}));

vi.mock("@/lib/server/ensureUser", () => ({ ensureUser: mocks.ensureUser }));
vi.mock("@/lib/server/pvp/season", () => ({
  getOrCreateCurrentSeason: mocks.getOrCreateCurrentSeason,
}));
vi.mock("@/lib/server/pvp/arenaTournamentService", () => ({
  ensureArenaTournament: mocks.ensureArenaTournament,
  latestArenaTournament: mocks.latestArenaTournament,
}));

import { GET } from "./route";

describe("GET arena tournament schedule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-22T00:00:00.000Z"));
    mocks.ensureUser.mockResolvedValue("viewer");
    mocks.getOrCreateCurrentSeason.mockResolvedValue({
      id: "2026-W34",
      endAt: new Date("2026-08-23T15:00:00.000Z"),
    });
    mocks.latestArenaTournament.mockResolvedValue({
      seasonId: "2026-W33",
      bracket: {
        version: 2,
        seasonId: "2026-W33",
        bracketSize: 0,
        minimumMatches: 10,
        generatedAt: "2026-08-15T15:00:00.000Z",
        startsAt: "2026-08-16T10:00:00.000Z",
        status: "not_enough_players",
        participants: [],
        matches: [],
        championUserId: null,
        rewards: [],
      },
    });
  });

  it("최근 대회 시각과 관계없이 현재 시즌의 경기 시작 시각을 반환한다", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.season.startsAt).toBe("2026-08-23T04:00:00.000Z");
    expect(json.tournament.bracket.startsAt).toBe("2026-08-16T10:00:00.000Z");
  });
  afterEach(() => vi.useRealTimers());

  it("reuses the request season when resolving Sunday's tournament", async () => {
    vi.setSystemTime(new Date("2026-08-23T11:00:00Z"));
    mocks.ensureArenaTournament.mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(200);
    expect((await response.json()).phase).toBe("tournament");
    expect(mocks.ensureArenaTournament).toHaveBeenCalledWith(
      new Date("2026-08-23T11:00:00Z"),
      { id: "2026-W34", endAt: new Date("2026-08-23T15:00:00Z") },
    );
  });

});
