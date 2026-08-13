import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  MarketplaceStackBrowse,
  StackBuyConfirm,
} from "./MarketplaceStackBrowse";
import type { MarketplaceStackGroup } from "./marketplaceShared";

const group: MarketplaceStackGroup = {
  key: "material:iron_ore",
  kind: "material",
  itemId: "iron_ore",
  itemName: "철광석",
  totalQuantity: 5,
  minUnitPrice: 100,
  listings: [
    {
      id: 1,
      isMine: false,
      isHighestBidder: false,
      kind: "material",
      itemId: "iron_ore",
      itemName: "철광석",
      quantity: 5,
      price: 500,
      instancePayload: null,
      createdAt: "2026-08-13T00:00:00.000Z",
      bidEndsAt: "2026-08-14T00:00:00.000Z",
      expiresAt: "2026-08-15T00:00:00.000Z",
      highestBid: null,
      bidCount: 0,
      bidResolvedAt: null,
      nextBid: 0,
    },
  ],
};

describe("MarketplaceStackBrowse", () => {
  it("renders the stack quote and buy-order demand", () => {
    const html = renderToStaticMarkup(
      <MarketplaceStackBrowse
        groups={[group]}
        quantities={{ [group.key]: "2" }}
        onQuantityChange={vi.fn()}
        onBuy={vi.fn()}
        busy={false}
        favoriteKeys={new Set()}
        onToggleFavorite={vi.fn()}
        orderBook={{
          [group.key]: {
            bestUnitPrice: 90,
            totalQuantity: 3,
          },
        }}
        onOpenTools={vi.fn()}
      />,
    );

    expect(html).toContain("철광석");
    expect(html).toContain("200G 구매");
    expect(html).toContain("최고 구매 주문 90G");
  });

  it("renders the confirmation total and insufficient-gold guard", () => {
    const html = renderToStaticMarkup(
      <StackBuyConfirm
        confirmation={{ group, quantity: 2, totalPrice: 200 }}
        availableGold={199}
        busy={false}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(html).toContain("묶음 구매 확인");
    expect(html).toContain("200G");
    expect(html).toContain("골드가 부족해요.");
  });
});
