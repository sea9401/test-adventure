import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LifeLevelMilestoneNotice } from "./LifeLevelMilestoneNotice";

describe("생활 확장 마일스톤 안내", () => {
  it("50레벨 미만에는 확장 안내를 표시하지 않는다", () => {
    expect(
      renderToStaticMarkup(
        <LifeLevelMilestoneNotice activity="farming" level={49} />,
      ),
    ).toBe("");
  });

  it("50레벨부터 다음 마일스톤과 해당 효과를 표시한다", () => {
    const html = renderToStaticMarkup(
      <LifeLevelMilestoneNotice activity="farming" level={55} />,
    );

    expect(html).toContain("다음 숙련 마일스톤 · Lv.60");
    expect(html).toContain("수확량 +1%");
    expect(html).toContain("희귀 수확 +0.25%p");
  });

  it("100레벨에는 최종 숙련 달성을 표시한다", () => {
    const html = renderToStaticMarkup(
      <LifeLevelMilestoneNotice activity="mining" level={100} />,
    );

    expect(html).toContain("최종 숙련 달성 · MAX");
  });
});
