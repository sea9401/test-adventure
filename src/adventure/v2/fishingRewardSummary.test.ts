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

  it("연속 보너스를 별도 지급이 아니라 총 코인에 포함된 구성분으로 안내한다", () => {
    expect(
      fishingRewardSummaryLabels({
        coinsGained: 8,
        streak: {
          current: 60,
          best: 60,
          buffTier: 5,
          coinBonus: 5,
        },
      }),
    ).toEqual([
      "코인 +8",
      "연속 60회 · 코인 보너스 +5 적용 (위 코인 획득량에 포함)",
    ]);
  });

  it("일일 코인 제한에 도달하면 연속 보너스가 활성 상태지만 지급되지 않았다고 안내한다", () => {
    expect(
      fishingRewardSummaryLabels({
        coinsGained: 0,
        dailyCatchCoins: { earned: 200, cap: 200 },
        streak: {
          current: 61,
          best: 61,
          buffTier: 5,
          coinBonus: 5,
        },
      }),
    ).toEqual([
      "일일 낚시 코인 제한 도달 · 추가 코인 +0",
      "연속 61회 · 코인 보너스 +5 활성 (일일 제한으로 이번 지급 0)",
    ]);
  });
});
