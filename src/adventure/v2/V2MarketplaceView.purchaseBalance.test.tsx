// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { V2_EQUIPMENT } from "@/adventure/data/v2/v2Equipment";
import { RewardToastProvider } from "./RewardToastProvider";
import { V2MarketplaceView, type MarketplacePreviewData } from "./V2MarketplaceView";

vi.mock("next/navigation", () => ({
  usePathname: () => "/marketplace",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("./GameStateProvider", () => ({
  useEquipmentCodexContext: () => null,
  useGameState: () => ({
    coreLoopOn: true,
    bankedGold: 3_000_000,
    frontierDepth: 42,
    refreshGameState: vi.fn(),
  }),
}));

afterEach(cleanup);

describe("거래소 단건 구매 잔액", () => {
  it("은행 우선 결제 시 구매 확인창에 사용 가능 골드의 구매 전후 잔액을 표시한다", () => {
    const item = Object.values(V2_EQUIPMENT).find(
      (candidate) => candidate.slot === "weapon",
    )!;
    const preview: MarketplacePreviewData = {
      viewerGold: 0,
      bidGraceMinHours: 2,
      bidGraceMaxHours: 24,
      fixedListingHours: 2,
      directListingHours: 24,
      prices: {},
      listings: [
        {
          id: 1,
          isMine: false,
          isHighestBidder: false,
          kind: "equip",
          itemId: item.id,
          itemName: item.name,
          quantity: 1,
          price: 2_000_000,
          instancePayload: {},
          createdAt: "2026-08-26T00:00:00.000Z",
          bidEndsAt: "2000-01-01T00:00:00.000Z",
          expiresAt: "9999-12-31T23:59:59.999Z",
          highestBid: null,
          bidCount: 0,
          bidResolvedAt: null,
          nextBid: 1,
        },
      ],
    };

    render(
      <RewardToastProvider>
        <V2MarketplaceView onBack={() => {}} preview={preview} />
      </RewardToastProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "구매" }));

    expect(screen.getByText("3,000,000 → 1,000,000")).not.toBeNull();
    expect(screen.queryByText("0 → -2,000,000")).toBeNull();
  });
});
