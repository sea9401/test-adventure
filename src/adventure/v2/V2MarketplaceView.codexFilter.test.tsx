// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RewardToastProvider } from "./RewardToastProvider";
import {
  V2MarketplaceView,
  type MarketplacePreviewData,
} from "./V2MarketplaceView";

const codexState = vi.hoisted(() => ({
  loaded: false,
  registeredIds: new Set<string>(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/marketplace",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("./GameStateProvider", () => ({
  useEquipmentCodexContext: () => ({
    loaded: codexState.loaded,
    registeredIds: codexState.registeredIds,
    replaceRegisteredIds: vi.fn(),
  }),
  useGameState: () => ({
    coreLoopOn: true,
    bankedGold: 0,
    frontierDepth: 42,
    refreshGameState: vi.fn(),
  }),
}));

const preview: MarketplacePreviewData = {
  viewerGold: 1_000_000,
  auctionHours: 6,
  bidExtensionWindowMinutes: 10,
  bidExtensionMinutes: 10,
  prices: {},
  listings: [
    [1, "v2_iron_sword", "철검"],
    [2, "v2_greatsword", "한타검"],
    [3, "v2_mithril_sword", "미스릴검"],
  ].map(([id, itemId, itemName]) => ({
    id: Number(id),
    isMine: false,
    isHighestBidder: false,
    hasMyBid: false,
    kind: "equip" as const,
    itemId: String(itemId),
    itemName: String(itemName),
    quantity: 1,
    price: 100_000,
    instancePayload: {},
    createdAt: "2026-09-03T00:00:00.000Z",
    bidEndsAt: "2000-01-01T00:00:00.000Z",
    expiresAt: "9999-12-31T23:59:59.999Z",
    highestBid: null,
    bidCount: 0,
    bidResolvedAt: null,
    nextBid: 1,
  })),
};

function renderMarketplace() {
  render(
    <RewardToastProvider>
      <V2MarketplaceView onBack={() => {}} preview={preview} />
    </RewardToastProvider>,
  );
}

function openFilters() {
  fireEvent.click(screen.getByRole("button", { name: /^필터/ }));
}

beforeEach(() => {
  codexState.loaded = false;
  codexState.registeredIds = new Set();
});

afterEach(cleanup);

describe("거래소 도감 미등록 필터", () => {
  it("도감 로딩 전에는 토글을 비활성화하고 매물을 보존한다", () => {
    renderMarketplace();
    openFilters();

    const loadingButton = screen.getByRole("button", {
      name: "도감 불러오는 중",
    }) as HTMLButtonElement;
    expect(loadingButton.disabled).toBe(true);
    expect(screen.getByText("철검")).toBeTruthy();
  });

  it("등록 장비를 제외하고 검색 조건과 함께 적용한 뒤 초기화한다", () => {
    codexState.loaded = true;
    codexState.registeredIds = new Set(["v2_iron_sword"]);
    renderMarketplace();
    openFilters();

    fireEvent.click(screen.getByRole("button", { name: "도감 미등록만 보기" }));
    expect(screen.queryByText("철검")).toBeNull();
    expect(screen.getByText("한타검")).toBeTruthy();
    expect(
      screen.getByTestId("marketplace-unregistered-codex-filter-chip")
        .textContent,
    ).toBe("도감 미등록");

    fireEvent.change(screen.getByPlaceholderText("아이템 또는 제작자 검색"), {
      target: { value: "미스릴" },
    });
    expect(screen.queryByText("한타검")).toBeNull();
    expect(screen.getByText("미스릴검")).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText("아이템 또는 제작자 검색"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: "필터 초기화" }));
    expect(screen.getByText("철검")).toBeTruthy();
    expect(
      screen.queryByTestId("marketplace-unregistered-codex-filter-chip"),
    ).toBeNull();
  });

  it("재료 탭에서는 숨기고 장비 탭 복귀 시 선택 상태를 보존한다", () => {
    codexState.loaded = true;
    renderMarketplace();
    openFilters();
    fireEvent.click(screen.getByRole("button", { name: "도감 미등록만 보기" }));

    fireEvent.click(screen.getByRole("tab", { name: "재료" }));
    expect(
      screen.queryByRole("button", { name: "✓ 도감 미등록만 보는 중" }),
    ).toBeNull();
    expect(
      screen.queryByTestId("marketplace-unregistered-codex-filter-chip"),
    ).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "무기" }));
    expect(
      screen
        .getByRole("button", { name: "✓ 도감 미등록만 보는 중" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("등록된 매물만 있으면 전용 빈 상태를 표시한다", () => {
    codexState.loaded = true;
    codexState.registeredIds = new Set([
      "v2_iron_sword",
      "v2_greatsword",
      "v2_mithril_sword",
    ]);
    renderMarketplace();
    openFilters();
    fireEvent.click(screen.getByRole("button", { name: "도감 미등록만 보기" }));

    expect(screen.getByText("도감 미등록 매물이 없어요.")).toBeTruthy();
  });
});
