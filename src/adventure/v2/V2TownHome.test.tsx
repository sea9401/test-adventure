import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { V2TownHome } from "./V2TownHome";

describe("마을 생활 콘텐츠 메뉴", () => {
  it("농장과 주방을 각각 독립된 진입 카드로 안내한다", () => {
    const html = renderToStaticMarkup(<V2TownHome onAction={vi.fn()} />);

    expect(html).toContain("모험가 농장");
    expect(html).toContain("작물을 재배하고 납품합니다.");
    expect(html).toContain(">주방<");
    expect(html).toContain("농작물과 어획물로 음식을 만듭니다.");
  });
});
