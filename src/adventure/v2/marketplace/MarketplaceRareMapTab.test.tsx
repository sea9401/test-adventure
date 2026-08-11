import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MarketplaceRareMapTab } from "./MarketplaceRareMapTab";

describe("MarketplaceRareMapTab 물고기 표본", () => {
  it("보유량을 최대 수량으로 하는 표본 판매 입력을 표시한다", () => {
    const html = renderToStaticMarkup(
      <MarketplaceRareMapTab
        rareMaps={[]}
        cashItems={{}}
        cookingFoods={{}}
        fishSpecimens={{ carp: 3 }}
        pager={{ page: 1, pageCount: 1, pageItems: [], setPage: vi.fn() }}
        prices={{}}
        setPrices={vi.fn()}
        qtys={{}}
        setQtys={vi.fn()}
        priceRef={{}}
        busy={false}
        onListConsumable={vi.fn()}
        onListCashItem={vi.fn()}
        onListCookingFood={vi.fn()}
        onListFishSpecimen={vi.fn()}
      />,
    );

    expect(html).toContain("잉어 표본");
    expect(html).toContain("보유 3개");
    expect(html).toContain('max="3"');
    expect(html).toContain("개당 가격");
  });
});
