import { Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MainTabSubItemIcon, TOWN_SUB_ITEMS } from "./MainTabNav";

describe("메인 마을 드롭다운 자체 SVG 아이콘", () => {
  it("평소 마을 탭에서 보이는 여섯 항목 모두 카테고리 SVG 타일을 사용한다", () => {
    const html = renderToStaticMarkup(
      <Fragment>
        {TOWN_SUB_ITEMS.map((item) => (
          <MainTabSubItemIcon key={item.href} item={item} />
        ))}
      </Fragment>,
    );

    expect(html.match(/viewBox="0 0 64 64"/g)).toHaveLength(6);
    expect(html).toContain("bg-rose-100");
    expect(html).toContain("bg-yellow-100");
    expect(html).toContain("bg-orange-100");
    expect(html).toContain("bg-red-100");
    expect(html).toContain("bg-cyan-100");
    expect(html).toContain("bg-emerald-100");
    expect(html).not.toContain("bg-violet-100");
  });

  it("마을 드롭다운의 기존 순서와 경로를 유지한다", () => {
    expect(TOWN_SUB_ITEMS.map(({ label, href }) => [label, href])).toEqual([
      ["치료소", "/town/healing"],
      ["은행", "/town/bank"],
      ["상점", "/town/shop"],
      ["대장간", "/town/smithy"],
      ["생활 지도", "/map"],
      ["모험가 농장", "/town/farm"],
    ]);
  });
});
