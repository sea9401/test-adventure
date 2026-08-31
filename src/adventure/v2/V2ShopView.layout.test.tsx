import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { GameStateProvider } from "./GameStateProvider";
import { V2ShopView } from "./V2ShopView";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dev/shop",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

describe("V2ShopView 모바일 구매 목록", () => {
  it("모바일 카드 행과 데스크톱 표를 같은 구매 목록에서 제공한다", () => {
    const html = renderToStaticMarkup(
      <GameStateProvider>
        <V2ShopView onBack={() => {}} />
      </GameStateProvider>,
    );

    expect(html).toContain('data-testid="shop-buy-header"');
    expect(html).toContain("hidden sm:grid");
    expect(html).toContain('data-testid="shop-buy-row"');
    expect(html).toContain("grid-cols-1 sm:grid-cols-");
    expect(html).toContain("w-full sm:w-auto");
  });
});
