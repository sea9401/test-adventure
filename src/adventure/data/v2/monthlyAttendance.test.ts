import { describe, expect, it } from "vitest";
import {
  MONTHLY_ATTENDANCE_REWARDS,
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
