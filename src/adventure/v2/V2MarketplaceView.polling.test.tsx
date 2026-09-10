// @vitest-environment jsdom

import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RewardToastProvider } from "./RewardToastProvider";
import { V2MarketplaceView } from "./V2MarketplaceView";

vi.mock("./GameStateProvider", () => ({
  useEquipmentCodexContext: () => null,
  useGameState: () => ({
    coreLoopOn: true,
    bankedGold: 0,
    frontierDepth: 42,
    refreshGameState: vi.fn(async () => {}),
  }),
}));

function setVisibility(value: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

function responseFor(url: string): Response {
  if (url.includes("/browse")) {
    return Response.json({
      ok: true,
      viewerGold: 100,
      auctionHours: 6,
      bidExtensionWindowMinutes: 10,
      bidExtensionMinutes: 10,
      listings: [],
    });
  }
  if (url.includes("/equipment")) return Response.json({ owned: [], equipped: {} });
  if (url.includes("/prices")) return Response.json({ ok: true, prices: {} });
  return Response.json({ ok: true });
}

describe("V2MarketplaceView adaptive polling", () => {
  const fetcher = vi.fn(async (input: RequestInfo | URL) => responseFor(String(input)));

  beforeEach(() => {
    vi.useFakeTimers();
    setVisibility("visible");
    fetcher.mockClear();
    vi.stubGlobal("fetch", fetcher);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("변화 없는 browse 응답을 10초에서 30초로 늦춘다", async () => {
    render(
      <RewardToastProvider>
        <V2MarketplaceView onBack={() => {}} />
      </RewardToastProvider>,
    );
    await act(async () => vi.advanceTimersByTimeAsync(0));
    const browseCalls = () =>
      fetcher.mock.calls.filter(([input]) => String(input).includes("/browse")).length;
    expect(browseCalls()).toBe(1);

    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    expect(browseCalls()).toBe(4);

    await act(async () => vi.advanceTimersByTimeAsync(29_999));
    expect(browseCalls()).toBe(4);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(browseCalls()).toBe(5);
  });

  it("hidden 동안 browse 요청을 멈추고 visible 복귀 시 즉시 갱신한다", async () => {
    render(
      <RewardToastProvider>
        <V2MarketplaceView onBack={() => {}} />
      </RewardToastProvider>,
    );
    await act(async () => vi.advanceTimersByTimeAsync(0));
    const browseCalls = () =>
      fetcher.mock.calls.filter(([input]) => String(input).includes("/browse")).length;

    act(() => setVisibility("hidden"));
    await act(async () => vi.advanceTimersByTimeAsync(10 * 60_000));
    expect(browseCalls()).toBe(1);

    act(() => setVisibility("visible"));
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(browseCalls()).toBe(2);
  });
});
