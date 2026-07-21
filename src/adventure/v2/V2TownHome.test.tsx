import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { V2TownHome } from "./V2TownHome";

describe("마을 자체 SVG 아이콘 파일럿", () => {
  it("마을의 여섯 진입 카드에 카테고리 타일을 표시한다", () => {
    const html = renderToStaticMarkup(<V2TownHome onAction={vi.fn()} />);

    expect(html.match(/viewBox="0 0 64 64"/g)).toHaveLength(6);
    expect(html).toContain("bg-cyan-100");
    expect(html).toContain("bg-rose-100");
    expect(html).toContain("bg-yellow-100");
    expect(html).toContain("bg-orange-100");
    expect(html).toContain("bg-red-100");
    expect(html).toContain("bg-emerald-100");
    expect(html).not.toContain("bg-violet-100");
  });

  it("기존 마을 진입 동작을 그대로 유지한다", () => {
    const html = renderToStaticMarkup(<V2TownHome onAction={vi.fn()} />);

    for (const title of [
      "생활 지도",
      "치료소",
      "은행",
      "상점",
      "대장간",
      "모험가 농장",
    ]) {
      expect(html).toContain(title);
    }
  });
});
