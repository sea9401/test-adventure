import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CookingCodexPanel } from "./CookingCodexPanel";
import { COOKING_RECIPES } from "./cooking";

describe("모험의 서 요리 완성 도감", () => {
  it("등록 수, 업적 효과 안내, 등록 여부를 함께 보여준다", () => {
    const html = renderToStaticMarkup(
      <CookingCodexPanel discoveredIds={["rustic_bread"]} />,
    );

    expect(html).toContain("요리 완성 도감");
    expect(html).toContain(`1 / ${COOKING_RECIPES.length}`);
    expect(html).toContain("별도의 능력치나 SP를 직접 지급하지는 않습니다");
    expect(html).toContain("차려지는 식탁");
    expect(html).toContain("투박한 밀빵");
    expect(html).toContain("도감 등록");
    expect(html).toContain("미등록");
  });
});
