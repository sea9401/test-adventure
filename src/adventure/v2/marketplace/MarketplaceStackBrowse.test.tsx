import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MarketplaceStackBrowse } from "./MarketplaceStackBrowse";
import type { Listing } from "./marketplaceShared";

const listings: Listing[] = [
  {
    id: 1,
    isMine: false,
    isHighestBidder: false,
    hasMyBid: false,
    kind: "material",
    itemId: "iron_ore",
    itemName: "철광석",
    quantity: 2,
    price: 200,
    instancePayload: null,
    createdAt: "2026-08-31T00:00:00.000Z",
    bidEndsAt: "2026-08-31T06:00:00.000Z",
    expiresAt: "2026-08-31T06:00:00.001Z",
    highestBid: null,
    bidCount: 0,
    bidResolvedAt: null,
    nextBid: 200,
  },
  {
    id: 2,
    isMine: false,
    isHighestBidder: false,
    hasMyBid: false,
    kind: "material",
    itemId: "iron_ore",
    itemName: "철광석",
    quantity: 3,
    price: 450,
    instancePayload: null,
    createdAt: "2026-08-31T00:01:00.000Z",
    bidEndsAt: "2026-08-31T06:01:00.000Z",
    expiresAt: "2026-08-31T06:01:00.001Z",
    highestBid: 450,
    bidCount: 1,
    bidResolvedAt: null,
    nextBid: 473,
  },
];

describe("MarketplaceStackBrowse", () => {
  it("같은 품목도 판매 등록별 묶음 전체 경매 카드로 표시한다", () => {
    const html = renderToStaticMarkup(
      <MarketplaceStackBrowse
        listings={listings}
        clockMs={Date.parse("2026-08-31T05:00:00.000Z")}
        busy={false}
        favoriteKeys={new Set()}
        onToggleFavorite={vi.fn()}
        onBid={vi.fn()}
        onOpenTools={vi.fn()}
      />,
    );

    expect(
      html.match(/data-testid="marketplace-stack-listing"/g),
    ).toHaveLength(2);
    expect(html).toContain("2개 전체");
    expect(html).toContain("3개 전체");
    expect(html).toContain("묶음 시작가");
    expect(html).toContain("200G");
    expect(html).toContain("다음 최소 입찰가");
    expect(html).toContain("473G");
    expect(html).not.toContain("구매 수량");
    expect(html).not.toContain("최저가 매물부터 자동 구매");
    expect(html).not.toContain("구매 주문");
  });
});


it("입찰 전에 실제 음식 효과와 지속 시간을 표시한다", () => {
  const html = renderToStaticMarkup(<MarketplaceStackBrowse
    listings={[{...listings[0], kind: "consumable", itemName: "밀빵", foodPreview: {effect: {combatFlat: {maxHp: 120}}, durationMs: 1_800_000}}]}
    clockMs={Date.parse("2026-08-31T05:00:00Z")} busy={false} favoriteKeys={new Set()}
    onToggleFavorite={vi.fn()} onBid={vi.fn()} onOpenTools={vi.fn()}
  />);
  expect(html).toContain("최대 HP +120");
  expect(html).toContain("30");
  expect(html.indexOf("최대 HP +120")).toBeLessThan(html.indexOf("묶음 입찰"));
});
it("같은 재료의 품목 즐겨찾기와 개별 관심 매물을 구분한다", () => {
  const html = renderToStaticMarkup(<MarketplaceStackBrowse
    listings={listings} clockMs={0} busy={false}
    favoriteKeys={new Set(["material:iron_ore"])} onToggleFavorite={vi.fn()}
    watchlist={{ ids: new Set([2]), toggle: vi.fn() }} onBid={vi.fn()} onOpenTools={vi.fn()}
  />);
  expect(html.match(/철광석 즐겨찾기 해제/g)).toHaveLength(2);
  expect(html.match(/철광석 관심 매물 추가/g)).toHaveLength(1);
  expect(html.match(/철광석 관심 매물 해제/g)).toHaveLength(1);
});
