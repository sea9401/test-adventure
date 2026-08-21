// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { V2ArenaTournamentTab } from "./V2ArenaTournamentTab";

const fetchMock = vi.fn();

describe("아레나 챔피언십 일정 안내", () => {
  beforeEach(() => {
    fetchMock.mockResolvedValue(
      Response.json({
        ok: true,
        phase: "ranked",
        season: {
          id: "2026-W34",
          rankedEndsAt: "2026-08-22T15:00:00.000Z",
          snapshotsAt: "2026-08-23T03:00:00.000Z",
          startsAt: "2026-08-23T04:00:00.000Z",
          endAt: "2026-08-23T15:00:00.000Z",
        },
        tournament: {
          seasonId: "2026-W33",
          isCurrent: false,
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
          myReward: null,
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("이전 대회가 조회되어도 현재 시즌의 13시 시작 시각을 표시한다", async () => {
    render(<V2ArenaTournamentTab />);

    const schedule = await screen.findByText(/^경기 시작/);
    expect(schedule.textContent).toContain("8. 23. (일)");
    expect(schedule.textContent).not.toContain("8. 16. (일)");
  });
});
