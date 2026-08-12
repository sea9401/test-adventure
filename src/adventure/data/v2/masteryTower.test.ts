import { describe, expect, it } from "vitest";
import {
  clearMasteryTowerFloor,
  failMasteryTowerRun,
  markMasteryTowerEntryStaminaPaid,
  masteryTowerAttemptLog,
  masteryTowerClaimPreview,
  masteryTowerCheckpointStartFloor,
  masteryTowerEntryStaminaCost,
  masteryTowerFloorReward,
  masteryTowerGuardianForFloor,
  masteryTowerGuardianPreview,
  masteryTowerRequiredPower,
  masteryTowerStartFloors,
  parseMasteryTowerState,
  resetMasteryTowerDailyProgress,
  resolveMasteryTowerAttemptFloor,
  rolloverMasteryTowerState,
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
      runFloor: 50,
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
          runFloor: 16,
          claimed: true,
          lifetimeBestFloor: 22,
          firstClearRewardsClaimed: [10, 20],
          cooldownUntil: 123456,
        },
        "2026-07-03",
      ),
    ).toEqual({
      date: "2026-07-03",
      todayBestFloor: 0,
      runFloor: 0,
      claimed: false,
      lifetimeBestFloor: 22,
      firstClearRewardsClaimed: [10, 20],
      weekStartedAt: "2026-06-29",
      weekBestFloor: 0,
      entryStaminaPaid: false,
    });
  });

  it("날짜 변경 시 전날 미수령 기본 보상과 첫 달성 보너스를 자동 정산한다", () => {
    const rollover = rolloverMasteryTowerState(
      {
        date: "2026-07-02",
        todayBestFloor: 18,
        runFloor: 16,
        claimed: false,
        lifetimeBestFloor: 22,
        firstClearRewardsClaimed: [],
        entryStaminaPaid: true,
      },
      "2026-07-03",
    );

    expect(rollover).toEqual({
      rolledOver: true,
      reward: {
        base: 440,
        firstClearBonus: 100,
        total: 540,
        newlyClaimedMilestones: [10],
        previousDate: "2026-07-02",
        previousBestFloor: 18,
      },
      tower: {
        date: "2026-07-03",
        todayBestFloor: 0,
        runFloor: 0,
        claimed: false,
        lifetimeBestFloor: 22,
        firstClearRewardsClaimed: [10],
        weekStartedAt: "2026-06-29",
        weekBestFloor: 0,
        entryStaminaPaid: false,
      },
    });
  });

  it("이미 수령한 전날 상태는 날짜만 넘기고 추가 보상을 만들지 않는다", () => {
    const rollover = rolloverMasteryTowerState(
      {
        date: "2026-07-02",
        todayBestFloor: 20,
        runFloor: 20,
        claimed: true,
        lifetimeBestFloor: 20,
        firstClearRewardsClaimed: [10, 20],
      },
      "2026-07-03",
    );

    expect(rollover.reward).toBeNull();
    expect(rollover.tower).toMatchObject({
      date: "2026-07-03",
      todayBestFloor: 0,
      firstClearRewardsClaimed: [10, 20],
    });
  });

  it("같은 날짜에 정산을 다시 실행해도 보상을 만들지 않는다", () => {
    const first = rolloverMasteryTowerState(
      {
        date: "2026-07-02",
        todayBestFloor: 10,
        claimed: false,
        lifetimeBestFloor: 10,
        firstClearRewardsClaimed: [],
      },
      "2026-07-03",
    );
    const duplicate = rolloverMasteryTowerState(first.tower, "2026-07-03");

    expect(duplicate.rolledOver).toBe(false);
    expect(duplicate.reward).toBeNull();
  });

  it("당일 첫 입장만 스태미나 200을 받고 이후 재도전은 무료다", () => {
    const state = parseMasteryTowerState(null, "2026-07-20");
    expect(masteryTowerEntryStaminaCost(state)).toBe(200);
    expect(
      masteryTowerEntryStaminaCost(markMasteryTowerEntryStaminaPaid(state)),
    ).toBe(0);
  });

  it("저장된 당일 입장료 납부 여부는 유지하고 날짜 변경 시 초기화한다", () => {
    const paid = parseMasteryTowerState(
      { date: "2026-07-20", entryStaminaPaid: true },
      "2026-07-20",
    );
    expect(paid.entryStaminaPaid).toBe(true);
    expect(
      parseMasteryTowerState(paid, "2026-07-21").entryStaminaPaid,
    ).toBe(false);
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
    expect(guardian.directActionSpd).toBe(true);
    expect(guardian.v2Skills?.equipped.length).toBeGreaterThan(0);
  });

  it("관리자 일일 초기화는 오늘 진행만 초기화하고 영구 기록은 유지한다", () => {
    expect(
      resetMasteryTowerDailyProgress({
        date: "2026-07-03",
        todayBestFloor: 18,
        runFloor: 18,
        claimed: true,
        lifetimeBestFloor: 24,
        firstClearRewardsClaimed: [10, 20],
      }),
    ).toEqual({
      date: "2026-07-03",
      todayBestFloor: 0,
      runFloor: 0,
      claimed: false,
      lifetimeBestFloor: 24,
      firstClearRewardsClaimed: [10, 20],
      entryStaminaPaid: false,
    });
  });

  it("도전 로그는 성공 판정과 보상 프리뷰를 포함한다", () => {
    const log = masteryTowerAttemptLog({
      floor: 10,
      success: true,
      tower: {
        date: "2026-07-03",
        todayBestFloor: 10,
        runFloor: 10,
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
        runFloor: 19,
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

  it("50층 연습 로그는 추가 보상 없이 기록 유지 전투임을 표시한다", () => {
    const log = masteryTowerAttemptLog({
      floor: 50,
      success: true,
      practice: true,
      tower: {
        date: "2026-08-09",
        todayBestFloor: 50,
        runFloor: 50,
        claimed: false,
        lifetimeBestFloor: 50,
        firstClearRewardsClaimed: [],
      },
      claimPreview: {
        base: 2_400,
        firstClearBonus: 1_500,
        total: 3_900,
        newlyClaimedMilestones: [10, 20, 30, 40, 50],
      },
    });

    expect(log.some((entry) => entry.text.includes("연습 승리"))).toBe(true);
    expect(log.some((entry) => entry.text.includes("기록 및 보상 변동 없음"))).toBe(
      true,
    );
    expect(log.some((entry) => entry.kind === "reward")).toBe(false);
  });

  it("패배하면 오늘 최고 기록은 유지하고 현재 등반만 초기화한다", () => {
    const cleared = clearMasteryTowerFloor(
      {
        date: "2026-07-03",
        todayBestFloor: 7,
        runFloor: 7,
        claimed: false,
        lifetimeBestFloor: 12,
        firstClearRewardsClaimed: [10],
        weekStartedAt: "2026-06-29",
        weekBestFloor: 7,
      },
      8,
    );

    expect(cleared).toEqual({
      date: "2026-07-03",
      todayBestFloor: 8,
      runFloor: 8,
      claimed: false,
      lifetimeBestFloor: 12,
      firstClearRewardsClaimed: [10],
      weekStartedAt: "2026-06-29",
      weekBestFloor: 8,
    });

    expect(failMasteryTowerRun(cleared, 1000)).toEqual({
      date: "2026-07-03",
      todayBestFloor: 8,
      runFloor: 0,
      claimed: false,
      lifetimeBestFloor: 12,
      firstClearRewardsClaimed: [10],
      weekStartedAt: "2026-06-29",
      weekBestFloor: 8,
      cooldownUntil: 31_000,
    });
  });

  it("이번 주 최고층으로 최근 10층 체크포인트의 다음 층을 계산한다", () => {
    for (const [weekBestFloor, expected] of [
      [0, null],
      [9, null],
      [10, 11],
      [37, 31],
      [50, 41],
    ] as const) {
      const state = parseMasteryTowerState(
        {
          date: "2026-08-09",
          weekStartedAt: "2026-08-03",
          weekBestFloor,
        },
        "2026-08-09",
        "2026-08-03",
      );
      expect(masteryTowerCheckpointStartFloor(state)).toBe(expected);
    }
  });

  it("새 등반은 1층과 최근 주간 체크포인트만 시작할 수 있다", () => {
    const state = parseMasteryTowerState(
      {
        date: "2026-08-09",
        weekStartedAt: "2026-08-03",
        weekBestFloor: 37,
      },
      "2026-08-09",
      "2026-08-03",
    );

    expect(masteryTowerStartFloors(state)).toEqual([1, 31]);
    expect(resolveMasteryTowerAttemptFloor(state, 1)).toEqual({ ok: true, floor: 1 });
    expect(resolveMasteryTowerAttemptFloor(state, 31)).toEqual({ ok: true, floor: 31 });
    expect(resolveMasteryTowerAttemptFloor(state, 27)).toEqual({
      ok: false,
      error: "invalid_start_floor",
    });
    expect(resolveMasteryTowerAttemptFloor(state, 31.5)).toEqual({
      ok: false,
      error: "invalid_start_floor",
    });
  });

  it("진행 중인 등반은 시작 층 변경 없이 다음 층만 이어간다", () => {
    const state = parseMasteryTowerState(
      {
        date: "2026-08-09",
        runFloor: 12,
        weekStartedAt: "2026-08-03",
        weekBestFloor: 37,
      },
      "2026-08-09",
      "2026-08-03",
    );

    expect(masteryTowerStartFloors(state)).toEqual([]);
    expect(resolveMasteryTowerAttemptFloor(state)).toEqual({ ok: true, floor: 13 });
    expect(resolveMasteryTowerAttemptFloor(state, 1)).toEqual({
      ok: false,
      error: "invalid_start_floor",
    });
  });

  it("50층 완료 후에는 시작 층 지정 없이 50층 연습 전투를 다시 시작한다", () => {
    const state = parseMasteryTowerState(
      {
        date: "2026-08-09",
        todayBestFloor: 50,
        runFloor: 50,
        lifetimeBestFloor: 50,
        weekStartedAt: "2026-08-03",
        weekBestFloor: 50,
      },
      "2026-08-09",
      "2026-08-03",
    );

    expect(resolveMasteryTowerAttemptFloor(state)).toEqual({
      ok: true,
      floor: 50,
    });
    expect(resolveMasteryTowerAttemptFloor(state, 50)).toEqual({
      ok: false,
      error: "invalid_start_floor",
    });
  });

  it("50층 연습 패배는 완료 기록을 유지하고 재도전 쿨다운만 건다", () => {
    const completed = parseMasteryTowerState(
      {
        date: "2026-08-09",
        todayBestFloor: 50,
        runFloor: 50,
        claimed: true,
        lifetimeBestFloor: 50,
        firstClearRewardsClaimed: [10, 20, 30, 40, 50],
        weekStartedAt: "2026-08-03",
        weekBestFloor: 50,
        entryStaminaPaid: true,
      },
      "2026-08-09",
      "2026-08-03",
    );

    expect(failMasteryTowerRun(completed, 1_000)).toEqual({
      ...completed,
      runFloor: 50,
      cooldownUntil: 31_000,
    });
  });

  it("월요일이 되면 주간 진행만 초기화하고 영구 기록은 유지한다", () => {
    const monday = parseMasteryTowerState(
      {
        date: "2026-08-09",
        todayBestFloor: 37,
        runFloor: 37,
        claimed: true,
        lifetimeBestFloor: 44,
        firstClearRewardsClaimed: [10, 20, 30, 40],
        weekStartedAt: "2026-08-03",
        weekBestFloor: 37,
      },
      "2026-08-10",
      "2026-08-10",
    );

    expect(monday).toMatchObject({
      date: "2026-08-10",
      todayBestFloor: 0,
      runFloor: 0,
      claimed: false,
      lifetimeBestFloor: 44,
      firstClearRewardsClaimed: [10, 20, 30, 40],
      weekStartedAt: "2026-08-10",
      weekBestFloor: 0,
    });
  });

  it("승리하면 주간 최고층을 올리고 패배해도 유지한다", () => {
    const state = parseMasteryTowerState(
      {
        date: "2026-08-09",
        weekStartedAt: "2026-08-03",
        weekBestFloor: 20,
      },
      "2026-08-09",
      "2026-08-03",
    );
    const cleared = clearMasteryTowerFloor(state, 21);

    expect(cleared.weekBestFloor).toBe(21);
    expect(failMasteryTowerRun(cleared, 1_000).weekBestFloor).toBe(21);
  });
});
