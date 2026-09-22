import { describe, expect, it } from "vitest";
import { applyGuildRaidDamage } from "./guildRaid";
import { chuseokWindow, chuseokPhase, chuseokAttendance, chuseokMaxHp } from "./chuseokEvent";

describe("추석 이벤트 규칙", () => {
  const window = { startsAt: Date.parse("2026-09-22T18:00:00+09:00"), endsAt: Date.parse("2026-10-02T18:00:00+09:00") };
  it("시간대 있는 배포 시작 시각부터 10일을 계산하고 미설정/잘못된 설정은 열지 않는다", () => {
    expect(chuseokWindow("2026-09-22T18:00:00+09:00")).toEqual(window);
    for (const value of [undefined, "", "invalid", "2026-09-22T18:00:00"]) expect(chuseokWindow(value)).toBeNull();
    expect(chuseokPhase(null, window.startsAt)).toBe("pending");
    expect(chuseokPhase(window, window.startsAt - 1)).toBe("pending");
    expect(chuseokPhase(window, window.startsAt)).toBe("active");
    expect(chuseokPhase(window, window.endsAt - 1)).toBe("active");
    expect(chuseokPhase(window, window.endsAt)).toBe("ended");
  });
  it("월이 바뀌거나 결석해도 누적 진도를 유지하고 KST 자정에 다음 보상을 연다", () => {
    expect(chuseokAttendance(["2026-09-22"], window, Date.parse("2026-09-22T23:59:59+09:00"))).toMatchObject({ canClaim: false, claimedToday: true });
    expect(chuseokAttendance(["2026-09-22"], window, Date.parse("2026-09-23T00:00:00+09:00"))).toMatchObject({ canClaim: true, nextReward: 5 });
    expect(chuseokAttendance(["2026-09-22", "2026-09-23"], window, Date.parse("2026-10-01T00:00:00+09:00"))).toMatchObject({ claimedCount: 2, nextReward: 10 });
  });
  it("7회에 걸쳐 회복약 80개를 지급하고 종료/완료 후에는 수령 불가다", () => {
    const days: string[] = [];
    const rewards: number[] = [];
    for (let day = 22; day <= 28; day++) {
      const status = chuseokAttendance(days, window, Date.parse(`2026-09-${day}T19:00:00+09:00`));
      expect(status.canClaim).toBe(true);
      rewards.push(status.nextReward!);
      days.push(status.todayKey);
    }
    expect(rewards).toEqual([5, 5, 10, 10, 15, 15, 20]);
    expect(rewards.reduce((a, b) => a + b, 0)).toBe(80);
    expect(chuseokAttendance(days, window, window.endsAt - 1)).toMatchObject({ complete: true, canClaim: false });
    expect(chuseokAttendance([], window, window.endsAt)).toMatchObject({ canClaim: false });
  });
  it("초과 피해를 1억 → 5억 → 10억 → 15억 단계로 넘긴다", () => {
    expect(applyGuildRaidDamage({ stage: 1, hp: 100_000_000, maxHp: 100_000_000 }, 1_600_000_010, chuseokMaxHp)).toEqual({ stage: 4, hp: 1_499_999_990, maxHp: 1_500_000_000, stagesCleared: 3 });
    expect(chuseokMaxHp(8)).toBe(3_500_000_000);
  });
});
