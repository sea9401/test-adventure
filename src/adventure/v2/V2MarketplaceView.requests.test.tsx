// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RewardToastProvider } from "./RewardToastProvider";
import { V2MarketplaceView } from "./V2MarketplaceView";

vi.mock("./GameStateProvider", () => ({
  useGameState: () => ({
    coreLoopOn: true,
    bankedGold: 0,
    frontierDepth: 42,
    refreshGameState: vi.fn(async () => {}),
  }),
}));

function responseFor(url: string): Response {
  if (url.includes("/browse")) {
    return Response.json({ ok: true, viewerGold: 0, listings: [] });
  }
  if (url.includes("/equipment")) {
    return Response.json({ owned: [], equipped: {} });
  }
  if (url.includes("/prices")) {
    return Response.json({ ok: true, prices: {} });
  }
  if (url.includes("/buy-orders")) {
    return Response.json({ ok: true, mine: [], book: [], equipmentOrders: [] });
  }
  if (url.includes("/price-alerts")) {
    return Response.json({ ok: true, alerts: [] });
  }
  return Response.json({ ok: true });
}

describe("V2MarketplaceView request timing", () => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) =>
    responseFor(String(input)),
  );

  beforeEach(() => {
    fetchMock.mockClear();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("does not load buy orders or price alerts on the initial browse tab", async () => {
    render(
      <RewardToastProvider>
        <V2MarketplaceView onBack={() => {}} />
      </RewardToastProvider>,
    );

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([input]) =>
          String(input).includes("/api/v2/marketplace/browse"),
        ),
      ).toBe(true);
    });

    const requestedUrls = fetchMock.mock.calls.map(([input]) => String(input));
    expect(requestedUrls.some((url) => url.includes("/buy-orders"))).toBe(false);
    expect(requestedUrls.some((url) => url.includes("/price-alerts"))).toBe(false);
  });

  it("loads automation data after the equipment order tool opens", async () => {
    render(
      <RewardToastProvider>
        <V2MarketplaceView onBack={() => {}} />
      </RewardToastProvider>,
    );
    fireEvent.click(
      await screen.findByRole("button", {
        name: "조건을 정해 장비 구매 주문 만들기",
      }),
    );

    await waitFor(() => {
      const requestedUrls = fetchMock.mock.calls.map(([input]) => String(input));
      expect(requestedUrls.some((url) => url.includes("/buy-orders"))).toBe(true);
      expect(requestedUrls.some((url) => url.includes("/price-alerts"))).toBe(true);
    });
  });
});
