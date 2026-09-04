import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MarketplaceMaterialTab } from "./MarketplaceMaterialTab";

describe("MarketplaceMaterialTab 생활 재료", () => {
  it("씨앗 수량과 묶음 전체 시작 입찰가를 따로 입력한다", () => {
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
    expect(html).toContain('placeholder="묶음 전체 시작 입찰가"');
    expect(html).toContain(
      'aria-label="밀 씨앗 묶음 전체 시작 입찰가"',
    );
    expect(html).toContain("선택한 수량 전체가 한 번에 낙찰됩니다");
    expect(html).not.toContain('placeholder="개당 가격"');
  });
});
