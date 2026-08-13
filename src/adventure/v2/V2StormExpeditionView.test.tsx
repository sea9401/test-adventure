import { describe, expect, it } from "vitest";
import { stormUniqueDropPreview } from "./V2StormExpeditionView";

const rules = {
  guardianRouteChance: 0.0015,
  finalRouteChance: 0.004,
  finalCrossChance: 0.002,
  finalHeartChance: 0.0005,
};

describe("폭풍 원정 유니크 보상 미리보기", () => {
  it("수호자에서는 선택 항로 유니크 확률만 표시한다", () => {
    expect(stormUniqueDropPreview("guardian", rules, 1)).toEqual([
      "항로 유니크 0.15%",
    ]);
  });

  it("최종 보스에서는 경로·교차·심장 독립 확률을 모두 표시한다", () => {
    expect(stormUniqueDropPreview("final_boss", rules, 1)).toEqual([
      "항로 유니크 0.40%",
      "교차 유니크 0.20%",
      "폭풍심장 유니크 0.05%",
    ]);
  });

  it("폭풍 계약은 경로·교차만 2배이며 심장 확률은 바꾸지 않는다", () => {
    expect(stormUniqueDropPreview("final_boss", rules, 2)).toEqual([
      "항로 유니크 0.80%",
      "교차 유니크 0.40%",
      "폭풍심장 유니크 0.05%",
    ]);
  });

  it("일반·정예 전투에는 유니크 보상 문구를 표시하지 않는다", () => {
    expect(stormUniqueDropPreview("elite", rules, 2)).toEqual([]);
  });
});
