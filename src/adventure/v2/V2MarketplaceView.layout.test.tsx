import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  MarketplaceHarness,
  marketplacePreview,
} from "@/app/dev/marketplace/MarketplaceHarness";
import { GameStateProvider } from "./GameStateProvider";
import { RewardToastProvider } from "./RewardToastProvider";
import { actionErrorLabel, V2MarketplaceView } from "./V2MarketplaceView";
import { MarketplaceRecentTradeList } from "./V2MarketplaceView";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dev/marketplace",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

describe("V2MarketplaceView 모바일 매물 카드", () => {
  it("거래 정지 응답을 공통 사유와 기간 안내로 변환한다", () => {
    expect(
      actionErrorLabel(
        {
          error: "trade_suspended",
          reason: "비정상 거래 조사",
          expiresAt: "2026-08-23T00:00:00.000Z",
          permanent: false,
        },
        403,
      ),
    ).toContain("거래 이용 제한");
    expect(
      actionErrorLabel(
        {
          error: "trade_suspended",
          reason: "비정상 거래 조사",
          expiresAt: "2026-08-23T00:00:00.000Z",
          permanent: false,
        },
        403,
      ),
    ).toContain("비정상 거래 조사");
  });

  it("거래소 안내와 보유 골드를 모바일에서 세로로 쌓는다", () => {
    const html = renderToStaticMarkup(<MarketplaceHarness />);

    expect(html).toContain('data-testid="marketplace-summary"');
    expect(html).toContain(
      "flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between",
    );
    expect(html).toContain("최근 거래");
    expect(html).toContain("grid-cols-4");
  });

  it("가격 정보와 입찰 동작을 모바일에서 세로로 쌓는다", () => {
    const auctionListingPreview = {
      ...marketplacePreview,
      listings: marketplacePreview.listings.map((listing) => ({
        ...listing,
        bidEndsAt: "9999-12-31T23:59:59.999Z",
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
            preview={auctionListingPreview}
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
    expect(html).toContain("시작 입찰가");
    expect(html).not.toContain("즉시구매");
  });

  it("본인 경매 매물도 구매 동작 없이 입찰 현황을 제공한다", () => {
    const ownAuctionPreview = {
      ...marketplacePreview,
      listings: marketplacePreview.listings.map((listing, index) => ({
        ...listing,
        isMine: index === 0,
        bidEndsAt: "9999-12-31T23:59:59.999Z",
        expiresAt: "9999-12-31T23:59:59.999Z",
        highestBid: null,
        bidCount: 0,
      })),
    };
    const html = renderToStaticMarkup(
      <GameStateProvider>
        <RewardToastProvider>
          <V2MarketplaceView onBack={() => {}} preview={ownAuctionPreview} />
        </RewardToastProvider>
      </GameStateProvider>,
    );

    expect(html).toContain("입찰");
    expect(html).not.toContain("즉시구매");
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

  it("음식 매물에는 희귀 지도 실물 경고를 표시하지 않는다", () => {
    const html = renderToStaticMarkup(
      <MarketplaceRecentTradeList
        rows={[
          {
            id: 43,
            isMine: false,
            isHighestBidder: false,
            kind: "consumable",
            itemId: "two_bite_boiled_bread",
            itemName: "두박한 밀빵 (일반)",
            quantity: 1,
            price: 100_000,
            instancePayload: { kind: "cooking_food" },
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

    expect(html).toContain("두박한 밀빵 (일반)");
    expect(html).not.toContain("실물 없음");
    expect(html).not.toContain("구매 불가");
  });
});
