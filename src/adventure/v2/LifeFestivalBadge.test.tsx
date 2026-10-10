import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LifeFestivalBadge } from "./LifeFestivalBadge";

const HARVEST_WEEK = new Date("2026-01-05T12:00:00+09:00");

describe("생활 축제 진행 표시", () => {
  it("이번 주 테마 대상 활동이면 효과와 축제 화면 링크를 보여 준다", () => {
    const html = renderToStaticMarkup(
      <LifeFestivalBadge activity="farming" now={HARVEST_WEEK} />,
    );
    expect(html).toContain("축제 진행 중");
    expect(html).toContain("수확제");
    expect(html).toContain("수확량 +10%");
    expect(html).toContain('href="/town/festival"');
    expect(html).toContain("ui-surface-inset");
  });

  it("다른 활동의 주에는 아무것도 그리지 않는다", () => {
    expect(
      renderToStaticMarkup(<LifeFestivalBadge activity="mining" now={HARVEST_WEEK} />),
    ).toBe("");
  });
});
