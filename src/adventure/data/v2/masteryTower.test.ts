import { describe, expect, it } from "vitest";
import {
  masteryTowerClaimPreview,
  masteryTowerFloorReward,
  masteryTowerRequiredPower,
  parseMasteryTowerState,
} from "./masteryTower";

describe("masteryTower", () => {
  it("층별 일일 보상은 10/20/30층 기준 300/750/1350", () => {
    expect(masteryTowerFloorReward(5)).toBe(150);
    expect(masteryTowerFloorReward(10)).toBe(300);
    expect(masteryTowerFloorReward(15)).toBe(525);
    expect(masteryTowerFloorReward(20)).toBe(750);
    expect(masteryTowerFloorReward(25)).toBe(1050);
    expect(masteryTowerFloorReward(30)).toBe(1350);
  });

  it("첫 도달 보너스는 미수령 milestone 만 합산한다", () => {
    const preview = masteryTowerClaimPreview({
      date: "2026-07-03",
      todayBestFloor: 30,
      claimed: false,
      lifetimeBestFloor: 30,
      firstClearRewardsClaimed: [10],
    });
    expect(preview).toEqual({
      base: 1350,
      firstClearBonus: 500,
      total: 1850,
      newlyClaimedMilestones: [20, 30],
    });
  });

  it("날짜가 바뀌면 오늘 최고층/수령 상태만 초기화한다", () => {
    expect(
      parseMasteryTowerState(
        {
          date: "2026-07-02",
          todayBestFloor: 18,
          claimed: true,
          lifetimeBestFloor: 22,
          firstClearRewardsClaimed: [10, 20],
        },
        "2026-07-03",
      ),
    ).toEqual({
      date: "2026-07-03",
      todayBestFloor: 0,
      claimed: false,
      lifetimeBestFloor: 22,
      firstClearRewardsClaimed: [10, 20],
    });
  });

  it("요구 전투력은 층이 오를수록 증가한다", () => {
    expect(masteryTowerRequiredPower(1)).toBeGreaterThan(0);
    expect(masteryTowerRequiredPower(10)).toBeLessThan(
      masteryTowerRequiredPower(20),
    );
    expect(masteryTowerRequiredPower(20)).toBeLessThan(
      masteryTowerRequiredPower(30),
    );
  });
});
