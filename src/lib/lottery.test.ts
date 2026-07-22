import { describe, expect, it } from "vitest";
import {
  LOTTERY_CYCLE_MS,
  lotteryPrizeAmounts,
  lotteryRoundWindow,
  parseLotteryCommand,
} from "./lottery";

describe("lottery rules", () => {
  it("한국시간 매시 정각부터 다음 정각까지를 한 회차로 계산한다", () => {
    const during = Date.parse("2026-07-22T14:59:59.000Z");
    const next = Date.parse("2026-07-22T15:00:00.000Z");
    expect(lotteryRoundWindow(during)).toEqual({
      startsAt: Date.parse("2026-07-22T14:00:00.000Z"),
      endsAt: Date.parse("2026-07-22T15:00:00.000Z"),
    });
    expect(lotteryRoundWindow(next).startsAt).toBe(next);
    expect(lotteryRoundWindow(next).endsAt - next).toBe(LOTTERY_CYCLE_MS);
  });

  it("수수료 10% 뒤 70/20/10을 정수 골드로 전액 배분한다", () => {
    const result = lotteryPrizeAmounts(450_000);
    expect(result).toEqual({
      feeAmount: 45_000,
      prizePool: 405_000,
      prizes: [283_500, 81_000, 40_500],
    });
    expect(result.prizes.reduce((sum, prize) => sum + prize, 0)).toBe(result.prizePool);
  });

  it("/복권은 1장, 숫자는 1~10장만 허용한다", () => {
    expect(parseLotteryCommand("/복권")).toEqual({ kind: "buy", count: 1 });
    expect(parseLotteryCommand(" /복권   10 ")).toEqual({ kind: "buy", count: 10 });
    expect(parseLotteryCommand("/복권 정보")).toEqual({ kind: "info" });
    expect(parseLotteryCommand("/복권 0")).toEqual({ kind: "invalid" });
    expect(parseLotteryCommand("/복권 11")).toEqual({ kind: "invalid" });
    expect(parseLotteryCommand("안녕하세요")).toEqual({ kind: "invalid" });
  });
});
