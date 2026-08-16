import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LifeMasteryMetricPill } from "./RankingsView";

describe("생활 숙련도 랭킹 안내", () => {
  it("다섯 생활의 100레벨 상한을 안내한다", () => {
    const html = renderToStaticMarkup(<LifeMasteryMetricPill />);

    expect(html).toContain("생활 숙련도");
    expect(html).toContain("각 생활은 Lv.100까지 반영");
  });
});
