import { describe, expect, it } from "vitest";
import {
  masteryTowerBossForFloor,
  masteryTowerClaimPreview,
  masteryTowerFloorInfo,
  masteryTowerFloorReward,
  masteryTowerRequiredPower,
  parseMasteryTowerState,
} from "./masteryTower";

describe("masteryTower", () => {
  it("층별 일일 보상은 뒤쪽 층일수록 더 크게 늘고 50층은 2400이다", () => {
    expect(masteryTowerFloorReward(5)).toBe(100);
    expect(masteryTowerFloorReward(10)).toBe(200);
    expect(masteryTowerFloorReward(20)).toBe(500);
    expect(masteryTowerFloorReward(30)).toBe(950);
    expect(masteryTowerFloorReward(40)).toBe(1550);
    expect(masteryTowerFloorReward(50)).toBe(2400);
  });

  it("첫 도달 보너스는 미수령 milestone 만 합산한다", () => {
    const preview = masteryTowerClaimPreview({
      date: "2026-07-03",
      todayBestFloor: 50,
      claimed: false,
      lifetimeBestFloor: 50,
      firstClearRewardsClaimed: [10],
    });
    expect(preview).toEqual({
      base: 2400,
      firstClearBonus: 1400,
      total: 3800,
      newlyClaimedMilestones: [20, 30, 40, 50],
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
    expect(masteryTowerRequiredPower(30)).toBeLessThan(
      masteryTowerRequiredPower(50),
    );
  });

  it("10층 단위는 경량 보스층으로 표시하고 요구 전투력에 약한 보정을 준다", () => {
    expect(masteryTowerBossForFloor(9)).toBeNull();
    expect(masteryTowerBossForFloor(10)?.name).toBe("수련장의 문지기");
    expect(masteryTowerBossForFloor(20)?.name).toBe("비전의 감시자");
    expect(masteryTowerBossForFloor(30)?.name).toBe("탑의 숙련자");
    expect(masteryTowerBossForFloor(40)?.name).toBe("침묵의 교관");
    expect(masteryTowerBossForFloor(50)?.name).toBe("정점의 대련자");

    expect(masteryTowerFloorInfo(10)).toMatchObject({
      floor: 10,
      reward: 200,
      requiredPower: 421,
      boss: { powerBonusPercent: 8 },
    });
    expect(masteryTowerFloorInfo(20)).toMatchObject({
      floor: 20,
      requiredPower: 1296,
      boss: { powerBonusPercent: 8 },
    });
    expect(masteryTowerFloorInfo(30)).toMatchObject({
      floor: 30,
      requiredPower: 2700,
      boss: { powerBonusPercent: 8 },
    });
    expect(masteryTowerFloorInfo(50)).toMatchObject({
      floor: 50,
      reward: 2400,
      requiredPower: 5508,
      boss: { powerBonusPercent: 8 },
    });
    expect(masteryTowerRequiredPower(10)).toBeGreaterThan(
      masteryTowerRequiredPower(9),
    );
  });

  it("30/40/50층 보스는 컨셉 기믹 조건 미달 시 요구 전투력이 오른다", () => {
    const weakProfile = {
      power: 3000,
      atk: 250,
      magicAtk: 120,
      def: 200,
      magicDef: 100,
      spd: 80,
      maxHp: 3000,
      critResistPct: 0,
      evaRating: 40,
      accRating: 80,
      extraAttackChancePct: 20,
    };
    const strongProfile = {
      power: 6000,
      atk: 950,
      magicAtk: 500,
      def: 650,
      magicDef: 250,
      spd: 160,
      maxHp: 6000,
      critResistPct: 12,
      evaRating: 160,
      accRating: 180,
      extraAttackChancePct: 80,
    };

    expect(masteryTowerFloorInfo(30, weakProfile).requiredPower).toBe(3024);
    expect(masteryTowerFloorInfo(30, strongProfile).requiredPower).toBe(2700);
    expect(masteryTowerFloorInfo(40, weakProfile).requiredPower).toBe(4720);
    expect(masteryTowerFloorInfo(40, strongProfile).requiredPower).toBe(4104);
    expect(masteryTowerFloorInfo(50, weakProfile).requiredPower).toBe(6830);
    expect(masteryTowerFloorInfo(50, strongProfile).requiredPower).toBe(5508);
    expect(masteryTowerFloorInfo(50, weakProfile).gimmick?.checks).toEqual([
      {
        id: "offense",
        label: "화력",
        value: 250,
        target: 900,
        passed: false,
      },
      {
        id: "endurance",
        label: "생존",
        value: 540,
        target: 1250,
        passed: false,
      },
      {
        id: "tempo",
        label: "템포",
        value: 210,
        target: 260,
        passed: false,
      },
    ]);
  });
});
