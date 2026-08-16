import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  MarketplaceHarness,
  marketplacePreview,
} from "@/app/dev/marketplace/MarketplaceHarness";
import { GameStateProvider } from "./GameStateProvider";
import { RewardToastProvider } from "./RewardToastProvider";
import { V2MarketplaceView } from "./V2MarketplaceView";

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
});
