import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  MarketplaceHarness,
  marketplacePreview,
} from "@/app/dev/marketplace/MarketplaceHarness";
import { GameStateProvider } from "./GameStateProvider";
import { RewardToastProvider } from "./RewardToastProvider";
import { V2MarketplaceView } from "./V2MarketplaceView";
import { MarketplaceRecentTradeList } from "./V2MarketplaceView";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dev/marketplace",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

describe("V2MarketplaceView 모바일 매물 카드", () => {
  it("거래소 안내와 보유 골드를 모바일에서 세로로 쌓는다", () => {
    const html = renderToStaticMarkup(<MarketplaceHarness />);

    expect(html).toContain('data-testid="marketplace-summary"');
    expect(html).toContain(
      "flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between",
    );
    expect(html).toContain("최근 거래");
    expect(html).toContain("grid-cols-4");
  });

  it("가격 정보와 구매 동작을 모바일에서 세로로 쌓는다", () => {
    const fixedListingPreview = {
      ...marketplacePreview,
      listings: marketplacePreview.listings.map((listing) => ({
        ...listing,
        bidEndsAt: "2000-01-01T00:00:00.000Z",
        expiresAt: "9999-12-31T23:59:59.999Z",
        highestBid: null,
        bidCount: 0,
      })),
    };
    const html = renderToStaticMarkup(
      <GameStateProvider>
        <RewardToastProvider>
          <V2MarketplaceView
            onBack={() => {}}
            preview={fixedListingPreview}
          />
        </RewardToastProvider>
      </GameStateProvider>,
    );

    expect(html).toContain('data-testid="marketplace-listing-footer"');
    expect(html).toContain(
      "flex flex-col items-stretch gap-3 sm:flex-row sm:items-end sm:justify-between",
    );
    expect(html).toContain('data-testid="marketplace-listing-action"');
    expect(html).toContain("w-full sm:w-auto");
  });

  it("본인 고정가 매물은 구매 대신 관리 동작을 제공한다", () => {
    const ownFixedPreview = {
      ...marketplacePreview,
      listings: marketplacePreview.listings.map((listing, index) => ({
        ...listing,
        isMine: index === 0,
        bidEndsAt: "2000-01-01T00:00:00.000Z",
        expiresAt: "9999-12-31T23:59:59.999Z",
        highestBid: null,
        bidCount: 0,
      })),
    };
    const html = renderToStaticMarkup(
      <GameStateProvider>
        <RewardToastProvider>
          <V2MarketplaceView onBack={() => {}} preview={ownFixedPreview} />
        </RewardToastProvider>
      </GameStateProvider>,
    );

    expect(html).toContain("내 매물 관리");
  });

  it("공개 체결 행은 개당 가격과 거래 신고 동작을 표시한다", () => {
    const html = renderToStaticMarkup(
      <MarketplaceRecentTradeList
        rows={[
          {
            id: 42,
            isMine: false,
            isHighestBidder: false,
            kind: "material",
            itemId: "iron_ore",
            itemName: "철광석",
            quantity: 5,
            price: 500,
            instancePayload: null,
            createdAt: "2026-08-17T01:00:00.000Z",
            bidEndsAt: "2026-08-17T01:00:00.000Z",
            expiresAt: "2026-08-17T01:00:00.000Z",
            highestBid: null,
            bidCount: 0,
            bidResolvedAt: "2026-08-17T01:00:00.000Z",
            nextBid: 1,
          },
        ]}
        clockMs={Date.parse("2026-08-17T02:00:00.000Z")}
      />,
    );

    expect(html).toContain("개당 100G");
    expect(html).toContain('aria-label="철광석 거래 신고"');
    expect(html).not.toContain("판매자");
    expect(html).not.toContain("구매자");
  });
});
