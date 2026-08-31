import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MarketplaceMaterialTab } from "./MarketplaceMaterialTab";

describe("MarketplaceMaterialTab 생활 재료", () => {
  it("씨앗 표시명과 보유량을 보여 주고 한 개부터 판매할 수 있다", () => {
    const html = renderToStaticMarkup(
      <MarketplaceMaterialTab
        items={["farm_seed:wheat"]}
        pager={{
          page: 1,
          pageCount: 1,
          pageItems: ["farm_seed:wheat"],
          setPage: vi.fn(),
        }}
        materials={{ "farm_seed:wheat": 1 }}
        prices={{}}
        setPrices={vi.fn()}
        qtys={{}}
        setQtys={vi.fn()}
        priceRef={{}}
        busy={false}
        onListMaterial={vi.fn()}
      />,
    );

    expect(html).toContain("밀 씨앗");
    expect(html).toContain("보유 1");
    expect(html).toContain('aria-label="밀 씨앗 판매 수량"');
    expect(html).toContain('min="1"');
    expect(html).toContain('max="1"');
  });
});
