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

  it("수호자는 층이 오를수록 실제 전투 스탯과 기믹이 강화된다", () => {
    const low = masteryTowerGuardianPreview(5);
    const mid = masteryTowerGuardianPreview(15);
    const high = masteryTowerGuardianPreview(50);
    expect(low.hp).toBeLessThan(mid.hp);
    expect(mid.hp).toBeLessThan(high.hp);
    expect(low.atk).toBeLessThan(mid.atk);
    expect(mid.atk).toBeLessThan(high.atk);
    expect(low.skills).toHaveLength(0);
    expect(mid.skills.length).toBeGreaterThan(0);
    expect(high.skills.length).toBeGreaterThan(mid.skills.length);
    expect(high.bonusAttackChancePct).toBeGreaterThan(0);
  });

  it("30/40/50층 수호자는 전용 이름과 기믹을 가진다", () => {
    expect(masteryTowerRequiredPower(10)).toBe(390);
    expect(masteryTowerRequiredPower(20)).toBe(1200);
    expect(masteryTowerRequiredPower(30)).toBe(2500);
    expect(masteryTowerRequiredPower(40)).toBe(3800);
    expect(masteryTowerRequiredPower(50)).toBe(5100);

    expect(masteryTowerGuardianPreview(30)).toMatchObject({
      name: "탑의 숙련자",
      gimmickName: "집중 방패",
      skills: ["mob_crushing_blow", "mob_savage_roar", "mob_rending_claw"],
    });
    expect(masteryTowerGuardianPreview(40)).toMatchObject({
      name: "침묵의 교관",
      gimmickName: "침묵 압박",
      atkType: "magic",
      skills: ["mob_arcane_burst", "mob_chilling_touch", "mob_venom_bite"],
    });
    expect(masteryTowerGuardianPreview(50)).toMatchObject({
      name: "정점의 대련자",
      gimmickName: "삼중 시험",
      atkType: "magic",
      skills: [
        "mob_arcane_nova",
        "mob_savage_roar",
        "mob_crushing_blow",
        "mob_chilling_touch",
      ],
    });
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
        base: 200,
        firstClearBonus: 100,
        total: 300,
        newlyClaimedMilestones: [10],
      },
      turns: 7,
      playerHp: 1200,
      playerMaxHp: 1500,
      enemyHp: 0,
      enemyMaxHp: 3000,
    });
    expect(log.map((entry) => entry.kind)).toContain("success");
    expect(log.at(-1)?.text).toContain("300");
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
