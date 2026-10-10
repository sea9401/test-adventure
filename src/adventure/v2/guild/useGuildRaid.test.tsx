// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  GuildRaidPracticeResult,
  GuildRaidState,
} from "./guildRaidTypes";
import { useGuildRaid } from "./useGuildRaid";

const state: GuildRaidState = {
  ok: true,
  event: {
    id: "guild-raid:2026-08-31",
    bossKind: "mountain_chief_hard",
    status: "active",
    phase: "active",
    stage: 1,
    hp: 1_200_000,
    maxHp: 1_200_000,
    startsAt: Date.UTC(2026, 7, 30, 15),
    endsAt: Date.UTC(2026, 8, 4, 15),
    settledAt: null,
  },
  my: {
    lockedGuildId: null,
    damage: 0,
    attackCount: 0,
    dailyAttackCount: 0,
    dailyAttackLimit: 3,
    remainingAttacks: 3,
    eligible: false,
    rewardClaimedAt: null,
    reward: null,
    bonusThresholdMet: null,
    canClaim: false,
  },
  selection: null,
  canSelect: true,
  bosses: [],
  board: "mountain_chief_hard",
  guild: { id: 7, name: "연습 길드", emblem: null, damage: 0, rank: null },
  members: [],
  leaderboard: [],
  leaderboardPagination: { page: 1, pageSize: 8, totalPages: 1, total: 0 },
  recentAttacks: [],
  recentPagination: { page: 1, pageSize: 8, totalPages: 1, total: 0 },
};

const practiceResult: GuildRaidPracticeResult = {
  ok: true,
  practice: true,
  bossKind: "mountain_chief_hard",
  playerName: "연습가",
  damageDealt: 1_234,
  damageTaken: 56,
  diedEarly: false,
  turns: 12,
  replay: {
    enemy: { name: "산군", hp: 1_200_000 },
    playerMaxHp: 500,
    playerMaxMp: 80,
    log: [{ kind: "info", text: "전투 시작" }],
  },
};

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("길드 토벌전 훅 연습", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("별도 연습 API 결과를 저장하고 토벌전 상태를 재조회하지 않는다", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/v2/guild/raid?")) return response(state);
      if (url === "/api/v2/guild/raid/practice") {
        return response(practiceResult);
      }
      throw new Error(`unexpected request: ${url}`);
    });
    const { result, unmount } = renderHook(() => useGuildRaid());
    await waitFor(() => expect(result.current.state).toEqual(state));

    await act(async () => {
      await result.current.practice();
    });

    expect(result.current.lastPractice).toEqual(practiceResult);
    expect(result.current.error).toBeNull();
    expect(
      fetchMock.mock.calls.filter(([input]) =>
        String(input).startsWith("/api/v2/guild/raid?"),
      ),
    ).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v2/guild/raid/practice",
      { method: "POST" },
    );
    unmount();
  });

  it("연습 계산 중에는 실전 공격 요청을 시작하지 않는다", async () => {
    let finishPractice: ((value: Response) => void) | null = null;
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/v2/guild/raid?")) {
        return Promise.resolve(response(state));
      }
      if (url === "/api/v2/guild/raid/practice") {
        return new Promise<Response>((resolve) => {
          finishPractice = resolve;
        });
      }
      if (url === "/api/v2/guild/raid/attack") {
        return Promise.resolve(response({ ok: true }));
      }
      throw new Error(`unexpected request: ${url}`);
    });
    const { result, unmount } = renderHook(() => useGuildRaid());
    await waitFor(() => expect(result.current.state).toEqual(state));

    act(() => {
      void result.current.practice();
      void result.current.attack();
    });

    expect(
      fetchMock.mock.calls.filter(
        ([input]) => String(input) === "/api/v2/guild/raid/attack",
      ),
    ).toHaveLength(0);

    await act(async () => {
      finishPractice?.(response(practiceResult));
    });
    await waitFor(() => expect(result.current.practicing).toBe(false));
    unmount();
  });

  it("지정한 보스로 연습을 요청한다", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/v2/guild/raid?")) return response(state);
      if (url === "/api/v2/guild/raid/practice") {
        return response({ ...practiceResult, bossKind: "canyon_predator_raid" });
      }
      throw new Error(`unexpected request: ${url}`);
    });
    const { result, unmount } = renderHook(() => useGuildRaid());
    await waitFor(() => expect(result.current.state).toEqual(state));

    await act(async () => {
      await result.current.practice("canyon_predator_raid");
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/v2/guild/raid/practice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bossId: "canyon_predator_raid" }),
    });
    unmount();
  });
});

describe("길드 토벌전 훅 보스 선택", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("선택 API를 호출한 뒤 상태를 다시 불러온다", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/v2/guild/raid?")) return response(state);
      if (url === "/api/v2/guild/raid/select") {
        return response({ ok: true, bossId: "canyon_predator_raid", selectedAt: 1 });
      }
      throw new Error(`unexpected request: ${url}`);
    });
    const { result, unmount } = renderHook(() => useGuildRaid());
    await waitFor(() => expect(result.current.state).toEqual(state));

    await act(async () => {
      await result.current.selectBoss("canyon_predator_raid");
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/v2/guild/raid/select", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bossId: "canyon_predator_raid" }),
    });
    expect(
      fetchMock.mock.calls.filter(([input]) =>
        String(input).startsWith("/api/v2/guild/raid?"),
      ).length,
    ).toBeGreaterThanOrEqual(2);
    expect(result.current.error).toBeNull();
    unmount();
  });

  it("이미 선택된 경우 오류를 보여주고 상태를 다시 불러온다", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/v2/guild/raid?")) return response(state);
      if (url === "/api/v2/guild/raid/select") {
        return response({ ok: false, error: "already_selected" }, 409);
      }
      throw new Error(`unexpected request: ${url}`);
    });
    const { result, unmount } = renderHook(() => useGuildRaid());
    await waitFor(() => expect(result.current.state).toEqual(state));

    await act(async () => {
      await result.current.selectBoss("canyon_predator_raid");
    });

    expect(result.current.error).toBe("already_selected");
    expect(
      fetchMock.mock.calls.filter(([input]) =>
        String(input).startsWith("/api/v2/guild/raid?"),
      ).length,
    ).toBeGreaterThanOrEqual(2);
    unmount();
  });

  it("순위표 보스를 바꾸면 board 파라미터로 다시 불러온다", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input).startsWith("/api/v2/guild/raid?")) return response(state);
      throw new Error(`unexpected request: ${String(input)}`);
    });
    const { result, unmount } = renderHook(() => useGuildRaid());
    await waitFor(() => expect(result.current.state).toEqual(state));

    await act(async () => {
      await result.current.setBoard("canyon_predator_raid");
    });

    const lastUrl = String(fetchMock.mock.calls.at(-1)?.[0]);
    expect(lastUrl).toContain("board=canyon_predator_raid");
    expect(lastUrl).toContain("leaderboardPage=1");
    unmount();
  });
});
