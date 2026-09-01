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
    return Response.json({
      ok: true,
      viewerGold: 0,
      auctionHours: 6,
      bidExtensionWindowMinutes: 10,
      bidExtensionMinutes: 10,
      listings: [],
    });
  }
  if (url.includes("/equipment")) {
    return Response.json({ owned: [], equipped: {} });
  }
  if (url.includes("/prices")) {
    return Response.json({ ok: true, prices: {} });
  }
  if (url.includes("/price-alerts")) {
    return Response.json({ ok: true, alerts: [] });
  }
  return Response.json({ ok: true });
}

describe("V2MarketplaceView request timing", () => {
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, _init?: RequestInit) =>
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

  it("loads only price alerts when the alert management tab opens", async () => {
    render(
      <RewardToastProvider>
        <V2MarketplaceView onBack={() => {}} />
      </RewardToastProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: /내 거래/ }));
    fireEvent.click(await screen.findByRole("button", { name: /가격 알림/ }));

    await waitFor(() => {
      const requestedUrls = fetchMock.mock.calls.map(([input]) => String(input));
      expect(requestedUrls.some((url) => url.includes("/price-alerts"))).toBe(true);
      expect(requestedUrls.some((url) => url.includes("/buy-orders"))).toBe(false);
    });
  });

  it("merges an extended bid deadline into the visible whole-lot card", async () => {
    const now = Date.now();
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/browse")) {
        return Response.json({
          ok: true,
          viewerGold: 10_000,
          auctionHours: 6,
          bidExtensionWindowMinutes: 10,
          bidExtensionMinutes: 10,
          listings: [
            {
              id: 7,
              isMine: false,
              isHighestBidder: false,
              kind: "material",
              itemId: "iron_ore",
              itemName: "철광석",
              quantity: 2,
              price: 100,
              instancePayload: null,
              createdAt: new Date(now - 60_000).toISOString(),
              bidEndsAt: new Date(now + 5 * 60_000).toISOString(),
              expiresAt: new Date(now + 5 * 60_000 + 1).toISOString(),
              highestBid: null,
              bidCount: 0,
              bidResolvedAt: null,
              nextBid: 100,
            },
          ],
        });
      }
      if (url.endsWith("/bid") && init?.method === "POST") {
        return Response.json({
          ok: true,
          highestBid: 100,
          nextBid: 105,
          bidEndsAt: new Date(now + 15 * 60_000).toISOString(),
          extended: true,
        });
      }
      return responseFor(url);
    });

    render(
      <RewardToastProvider>
        <V2MarketplaceView onBack={() => {}} />
      </RewardToastProvider>,
    );
    fireEvent.click(await screen.findByRole("tab", { name: "재료" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "철광석 2개 묶음 입찰" }),
    );
    const bidButtons = await screen.findAllByRole("button", { name: "입찰" });
    fireEvent.click(bidButtons[bidButtons.length - 1]);

    await waitFor(() => {
      expect(screen.getByText("15분 남음")).toBeTruthy();
      expect(screen.getAllByText(/마감 10분 연장/).length).toBeGreaterThan(0);
    });
    const bidRequest = fetchMock.mock.calls.find(
      ([input, init]) => String(input).endsWith("/bid") && init?.method === "POST",
    );
    expect(JSON.parse(String(bidRequest?.[1]?.body))).toEqual({
      listingId: 7,
      amount: 100,
    });
  });
});
