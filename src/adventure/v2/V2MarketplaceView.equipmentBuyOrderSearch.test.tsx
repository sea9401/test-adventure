// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RewardToastProvider } from "./RewardToastProvider";
import {
  V2MarketplaceView,
  type MarketplacePreviewData,
} from "./V2MarketplaceView";

vi.mock("next/navigation", () => ({
  usePathname: () => "/marketplace",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("./GameStateProvider", () => ({
  useEquipmentCodexContext: () => null,
  useGameState: () => ({
    coreLoopOn: true,
    bankedGold: 0,
    frontierDepth: 42,
    refreshGameState: vi.fn(),
  }),
}));

afterEach(cleanup);

const preview: MarketplacePreviewData = {
  viewerGold: 0,
  bidGraceMinHours: 2,
  bidGraceMaxHours: 24,
  fixedListingHours: 2,
  directListingHours: 24,
  prices: {},
  listings: [],
};

function renderMarketplace() {
  render(
    <RewardToastProvider>
      <V2MarketplaceView onBack={() => {}} preview={preview} />
    </RewardToastProvider>,
  );
}

describe("거래소 장비 구매 주문 세트 검색", () => {
  it.each([
    ["반지", "질풍눈 반지"],
    ["목걸이", "항로잡이 나침반"],
  ])("%s 목록에서 천공추적 세트명으로 장비를 찾는다", async (slot, itemName) => {
    renderMarketplace();

    fireEvent.click(screen.getByRole("tab", { name: slot }));
    fireEvent.click(
      screen.getByRole("button", { name: "조건을 정해 장비 구매 주문 만들기" }),
    );
    fireEvent.change(await screen.findByPlaceholderText("장비 이름 검색"), {
      target: { value: "천공추적" },
    });

    expect(await screen.findByText(itemName)).not.toBeNull();
    expect(await screen.findByText("천공추적 세트")).not.toBeNull();
  });
});
