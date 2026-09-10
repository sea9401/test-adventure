// @vitest-environment jsdom

import { act, cleanup, render, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GuildRaidState } from "./guildRaidTypes";
import { GuildTradePostPanel } from "./GuildTradePostPanel";
import { useGuildRaid } from "./useGuildRaid";

const RAID_STATE = {
  ok: true,
  event: { id: "raid", status: "active", hp: 100 },
  my: {},
  guild: null,
  members: [],
  leaderboard: [],
  recentAttacks: [],
} as unknown as GuildRaidState;

const TRADE_STATE = {
  ok: true,
  level: 1,
  stageLabel: "초급",
  weekKey: "2026-W37",
  eligible: true,
  canManage: false,
  canPurchase: false,
  rewardBonusPct: 0,
  tokenYieldBonusPct: 0,
  contribution: { points: 0, cap: 100, remaining: 100 },
  tokens: 0,
  contracts: [],
  shop: [],
};

function setVisibility(value: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  vi.useFakeTimers();
  setVisibility("visible");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("guild shared state polling", () => {
  it("길드 레이드는 unchanged 2회 뒤 20초에서 60초로 늦춘다", async () => {
    const fetcher = vi.fn(async () => Response.json(RAID_STATE));
    vi.stubGlobal("fetch", fetcher);
    renderHook(() => useGuildRaid());
    await act(async () => vi.advanceTimersByTimeAsync(0));
    await act(async () => vi.advanceTimersByTimeAsync(20_000));
    await act(async () => vi.advanceTimersByTimeAsync(20_000));
    expect(fetcher).toHaveBeenCalledTimes(3);
    await act(async () => vi.advanceTimersByTimeAsync(59_999));
    expect(fetcher).toHaveBeenCalledTimes(3);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it("공동 토큰 교역소만 적응형 폴링하고 개인 교역소는 진입 조회만 한다", async () => {
    const fetcher = vi.fn(async () => Response.json(TRADE_STATE));
    vi.stubGlobal("fetch", fetcher);
    const shared = render(<GuildTradePostPanel />);
    await act(async () => vi.advanceTimersByTimeAsync(0));
    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    expect(fetcher).toHaveBeenCalledTimes(2);
    shared.unmount();

    fetcher.mockClear();
    render(<GuildTradePostPanel sharedTokens={false} />);
    await act(async () => vi.advanceTimersByTimeAsync(0));
    await act(async () => vi.advanceTimersByTimeAsync(5 * 60_000));
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
