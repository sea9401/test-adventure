import { describe, expect, it } from "vitest";
import { fishingRewardSummaryLabels } from "./fishingRewardSummary";

describe("fishingRewardSummaryLabels", () => {
  it("낚시 진행 경험치와 실제 직업 숙련도를 서로 다른 문구로 표시한다", () => {
    expect(
      fishingRewardSummaryLabels({
        coinsGained: 4,
        fishingXpGained: 3,
        fishingLevel: 13,
        masteryGained: 1,
      }),
    ).toEqual([
      "코인 +4",
      "낚시 경험치 +3 · 낚시 Lv 13",
      "직업 숙련도 +1",
    ]);
  });

  it("낚시 레벨 상승과 직업 숙련도 미획득 상태를 정확히 표시한다", () => {
    expect(
      fishingRewardSummaryLabels({
        fishingXpGained: 5,
        fishingLevel: 14,
        fishingLevelUp: true,
        masteryGained: 0,
      }),
    ).toEqual(["낚시 경험치 +5 · 낚시 Lv 14 상승"]);
  });
});
