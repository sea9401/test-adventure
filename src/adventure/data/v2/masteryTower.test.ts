import { describe, expect, it } from "vitest";
import {
  masteryTowerAttemptLog,
  masteryTowerClaimPreview,
  masteryTowerFloorReward,
  masteryTowerGuardianForFloor,
  masteryTowerGuardianPreview,
  masteryTowerRequiredPower,
  parseMasteryTowerState,
  resetMasteryTowerDailyProgress,
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

  it("수호자는 층이 오를수록 실제 전투 스탯과 기믹이 강화된다", () => {
    const low = masteryTowerGuardianPreview(5);
    const mid = masteryTowerGuardianPreview(15);
    const high = masteryTowerGuardianPreview(30);
    expect(low.hp).toBeLessThan(mid.hp);
    expect(mid.hp).toBeLessThan(high.hp);
    expect(low.atk).toBeLessThan(mid.atk);
    expect(mid.atk).toBeLessThan(high.atk);
    expect(low.skills).toHaveLength(0);
    expect(mid.skills.length).toBeGreaterThan(0);
    expect(high.skills.length).toBeGreaterThan(mid.skills.length);
    expect(high.bonusAttackChancePct).toBeGreaterThan(0);
  });

  it("수호자 전투 몬스터는 드랍/경험치 없이 생성된다", () => {
    const guardian = masteryTowerGuardianForFloor(25);
    expect(guardian.exp).toBe(0);
    expect(guardian.drops).toEqual([]);
    expect(guardian.v2Skills?.equipped.length).toBeGreaterThan(0);
  });

  it("관리자 일일 초기화는 오늘 진행만 초기화하고 영구 기록은 유지한다", () => {
    expect(
      resetMasteryTowerDailyProgress({
        date: "2026-07-03",
        todayBestFloor: 18,
        claimed: true,
        lifetimeBestFloor: 24,
        firstClearRewardsClaimed: [10, 20],
      }),
    ).toEqual({
      date: "2026-07-03",
      todayBestFloor: 0,
      claimed: false,
      lifetimeBestFloor: 24,
      firstClearRewardsClaimed: [10, 20],
    });
  });

  it("도전 로그는 성공 판정과 보상 프리뷰를 포함한다", () => {
    const log = masteryTowerAttemptLog({
      floor: 10,
      success: true,
      tower: {
        date: "2026-07-03",
        todayBestFloor: 10,
        claimed: false,
        lifetimeBestFloor: 10,
        firstClearRewardsClaimed: [],
      },
      claimPreview: {
        base: 300,
        firstClearBonus: 100,
        total: 400,
        newlyClaimedMilestones: [10],
      },
      turns: 7,
      playerHp: 1200,
      playerMaxHp: 1500,
      enemyHp: 0,
      enemyMaxHp: 3000,
    });
    expect(log.map((entry) => entry.kind)).toContain("success");
    expect(log.at(-1)?.text).toContain("400");
  });

  it("도전 로그는 실패 시 수호자 잔여 HP를 표시한다", () => {
    const log = masteryTowerAttemptLog({
      floor: 20,
      success: false,
      tower: {
        date: "2026-07-03",
        todayBestFloor: 19,
        claimed: false,
        lifetimeBestFloor: 19,
        firstClearRewardsClaimed: [10],
      },
      claimPreview: {
        base: 0,
        firstClearBonus: 0,
        total: 0,
        newlyClaimedMilestones: [],
      },
      turns: 12,
      playerHp: 0,
      playerMaxHp: 1800,
      enemyHp: 850,
      enemyMaxHp: 4200,
    });
    expect(log.map((entry) => entry.kind)).toContain("fail");
    expect(log.some((entry) => entry.text.includes("850"))).toBe(true);
  });
});
