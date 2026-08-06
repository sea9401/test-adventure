import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SkillLearningCostSummary } from "./V2SkillLearnView";

describe("SkillLearningCostSummary", () => {
  it("학습 전에 숙달 포인트와 장착 SP 비용을 명확히 구분한다", () => {
    const html = renderToStaticMarkup(
      <SkillLearningCostSummary learnCost={1500} spCost={4} />,
    );

    expect(html).toContain("학습 숙달 1,500");
    expect(html).toContain("장착 SP 4");
  });
});
