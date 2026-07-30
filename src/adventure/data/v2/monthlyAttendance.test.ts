import { describe, expect, it } from "vitest";
import {
  MONTHLY_ATTENDANCE_REWARDS,
  monthlyAttendanceRewardLabel,
  monthlyAttendanceState,
  monthlyAttendanceStatus,
} from "./monthlyAttendance";

describe("월간 출석", () => {
  it("1일차 보상은 월간 모험 지원권 30일이다", () => {
    expect(MONTHLY_ATTENDANCE_REWARDS).toHaveLength(28);
    expect(MONTHLY_ATTENDANCE_REWARDS[0]).toEqual({
      kind: "adventure_support",
      days: 30,
    });
  });

  it("골드 없이 성장 재료와 소모품으로 28일 보상판을 구성한다", () => {
    expect(MONTHLY_ATTENDANCE_REWARDS).toHaveLength(28);
    expect(MONTHLY_ATTENDANCE_REWARDS.map((reward) => reward.kind)).not.toContain(
      "gold",
    );
    expect(MONTHLY_ATTENDANCE_REWARDS[13]).toEqual({
      kind: "boss_summon_scroll",
      count: 3,
      cosmeticBox: "chat_badge_box",
    });
    expect(MONTHLY_ATTENDANCE_REWARDS[20]).toEqual({
      kind: "mastery_certificate",
      count: 300,
    });
    expect(MONTHLY_ATTENDANCE_REWARDS[27]).toEqual({
      kind: "enhancement_stone_bundle",
      red: 2,
      blue: 2,
      cosmeticBox: "profile_border_box",
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
      "붉은·푸른 강화석 각 2개 · 프로필 꾸미기 상자",
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
