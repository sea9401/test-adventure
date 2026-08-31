import { describe, expect, it } from "vitest";
import {
  MONTHLY_ATTENDANCE_REWARDS,
  monthlyAttendanceRewardLabel,
  monthlyAttendanceState,
  monthlyAttendanceStatus,
} from "./monthlyAttendance";

describe("월간 출석", () => {
  it("1일차 보상은 월간 모험 지원권 15일이다", () => {
    expect(MONTHLY_ATTENDANCE_REWARDS).toHaveLength(28);
    expect(MONTHLY_ATTENDANCE_REWARDS[0]).toEqual({
      kind: "adventure_support",
      days: 15,
    });
  });

  it("강화석 없이 탐험 재화와 이정표 보상으로 28일 보상판을 구성한다", () => {
    expect(MONTHLY_ATTENDANCE_REWARDS).toHaveLength(28);
    const rewardKinds = MONTHLY_ATTENDANCE_REWARDS.map(
      (reward) => reward.kind,
    );
    for (const forbiddenKind of [
      "enhancement_stone",
      "enhancement_stone_bundle",
      "gold",
      "sp_fruit",
    ]) {
      expect(rewardKinds).not.toContain(forbiddenKind);
    }
    expect(
      [2, 6, 8, 11, 15, 17, 19, 22, 24, 26].map(
        (day) => MONTHLY_ATTENDANCE_REWARDS[day - 1],
      ),
    ).toEqual([
      { kind: "torn_map_fragment", count: 2 },
      { kind: "coop_coin", count: 20 },
      { kind: "boss_summon_scroll", count: 2 },
      { kind: "torn_map_fragment", count: 3 },
      { kind: "coop_coin", count: 25 },
      { kind: "boss_summon_scroll", count: 2 },
      { kind: "torn_map_fragment", count: 5 },
      { kind: "coop_coin", count: 35 },
      { kind: "boss_summon_scroll", count: 3 },
      { kind: "coop_coin", count: 40 },
    ]);
    expect(MONTHLY_ATTENDANCE_REWARDS[13]).toEqual({
      kind: "adventure_support",
      days: 7,
      cosmeticBox: "chat_badge_box",
    });
    expect(MONTHLY_ATTENDANCE_REWARDS[20]).toEqual({
      kind: "mastery_certificate",
      count: 300,
      adventureSupportDays: 7,
    });
    expect(monthlyAttendanceRewardLabel(MONTHLY_ATTENDANCE_REWARDS[20])).toBe(
      "숙련의 증표 300개 · 월간 모험 지원권 7일",
    );
    expect(MONTHLY_ATTENDANCE_REWARDS[27]).toEqual({
      kind: "mastery_certificate",
      count: 500,
      cosmeticBox: "profile_border_box",
    });
  });

  it("월간 합계는 지원권 29일과 탐험 재화 완결 수량을 지급한다", () => {
    const totals = {
      adventureSupportDays: 0,
      staminaPotions: 0,
      masteryCertificates: 0,
      bossSummonScrolls: 0,
      tornMapFragments: 0,
      coopCoins: 0,
    };

    for (const reward of MONTHLY_ATTENDANCE_REWARDS) {
      if (reward.kind === "adventure_support") {
        totals.adventureSupportDays += reward.days;
      }
      if ("adventureSupportDays" in reward) {
        totals.adventureSupportDays += reward.adventureSupportDays;
      }
      if (reward.kind === "stamina_potion") {
        totals.staminaPotions += reward.count;
      } else if (reward.kind === "mastery_certificate") {
        totals.masteryCertificates += reward.count;
      } else if (reward.kind === "boss_summon_scroll") {
        totals.bossSummonScrolls += reward.count;
      } else if (reward.kind === "torn_map_fragment") {
        totals.tornMapFragments += reward.count;
      } else if (reward.kind === "coop_coin") {
        totals.coopCoins += reward.count;
      }
    }

    expect(totals).toEqual({
      adventureSupportDays: 29,
      staminaPotions: 29,
      masteryCertificates: 800,
      bossSummonScrolls: 7,
      tornMapFragments: 10,
      coopCoins: 120,
    });
  });

  it("7·14·28일차에 닉네임·배지·프로필 꾸미기 상자를 추가한다", () => {
    expect(MONTHLY_ATTENDANCE_REWARDS[6].cosmeticBox).toBe(
      "chroma_name_box",
    );
    expect(MONTHLY_ATTENDANCE_REWARDS[13].cosmeticBox).toBe(
      "chat_badge_box",
    );
    expect(MONTHLY_ATTENDANCE_REWARDS[27].cosmeticBox).toBe(
      "profile_border_box",
    );
    expect(monthlyAttendanceRewardLabel(MONTHLY_ATTENDANCE_REWARDS[27])).toBe(
      "숙련의 증표 500개 · 프로필 꾸미기 상자",
    );
  });

  it("스태미나 회복약은 한 번에 2개 이상, 한 달에 총 29개 지급한다", () => {
    const potionRewards = MONTHLY_ATTENDANCE_REWARDS.filter(
      (reward) => reward.kind === "stamina_potion",
    );

    expect(potionRewards.every((reward) => reward.count >= 2)).toBe(true);
    expect(
      potionRewards.reduce((total, reward) => total + reward.count, 0),
    ).toBe(29);
  });

  it("같은 달에는 빠진 날이 있어도 누적 출석을 유지한다", () => {
    const now = new Date("2026-07-20T03:00:00Z");
    const status = monthlyAttendanceStatus(
      {
        monthKey: "2026-07",
        claimedDayKeys: ["2026-07-02", "2026-07-10"],
      },
      now,
    );

    expect(status.claimedCount).toBe(2);
    expect(status.nextDay).toBe(3);
    expect(status.canClaim).toBe(true);
  });

  it("KST 기준 월이 바뀌면 새 출석판으로 초기화한다", () => {
    const before = new Date("2026-07-31T14:59:59Z");
    const after = new Date("2026-07-31T15:00:00Z");
    const saved = {
      monthKey: "2026-07",
      claimedDayKeys: ["2026-07-31"],
    };

    expect(monthlyAttendanceState(saved, before).claimedDayKeys).toHaveLength(1);
    expect(monthlyAttendanceState(saved, after)).toEqual({
      monthKey: "2026-08",
      claimedDayKeys: [],
    });
  });

  it("같은 KST 날짜에는 두 번 받을 수 없다", () => {
    const now = new Date("2026-07-20T03:00:00Z");
    const status = monthlyAttendanceStatus(
      {
        monthKey: "2026-07",
        claimedDayKeys: ["2026-07-20"],
      },
      now,
    );

    expect(status.claimedToday).toBe(true);
    expect(status.canClaim).toBe(false);
  });
});
