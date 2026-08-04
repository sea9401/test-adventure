import { describe, expect, it } from "vitest";
import {
  LOTTERY_BASE_PRIZE_POOL,
  LOTTERY_CYCLE_MS,
  hasEnoughLotteryParticipants,
  lotteryPrizeAmounts,
  lotteryRoundWindow,
  parseLotteryCommand,
} from "./lottery";

describe("lottery rules", () => {
  it("한국시간 0·4·8·12·16·20시부터 4시간을 한 회차로 계산한다", () => {
    const during = Date.parse("2026-07-22T14:59:59.000Z");
    const next = Date.parse("2026-07-22T15:00:00.000Z");
    expect(lotteryRoundWindow(during)).toEqual({
      startsAt: Date.parse("2026-07-22T11:00:00.000Z"),
      endsAt: Date.parse("2026-07-22T15:00:00.000Z"),
    });
    expect(lotteryRoundWindow(next).startsAt).toBe(next);
    expect(lotteryRoundWindow(next).endsAt - next).toBe(LOTTERY_CYCLE_MS);
  });

  it("이월금이 없으면 기본 상금 50만 골드로 새 회차를 시작한다", () => {
    expect(lotteryPrizeAmounts(0)).toEqual({
      feeAmount: 0,
      prizePool: LOTTERY_BASE_PRIZE_POOL,
      prizes: [350_000, 100_000, 50_000],
    });
  });

  it("기본 상금에 새 구매액의 수수료 10%를 뺀 뒤 70/20/10으로 전액 배분한다", () => {
    const result = lotteryPrizeAmounts(450_000);
    expect(result).toEqual({
      feeAmount: 45_000,
      prizePool: 905_000,
      prizes: [633_500, 181_000, 90_500],
    });
    expect(result.prizes.reduce((sum, prize) => sum + prize, 0)).toBe(result.prizePool);
  });

  it("이월 상금에는 수수료를 다시 떼지 않고 새 구매액의 순액만 더한다", () => {
    const result = lotteryPrizeAmounts(600_000, 405_000);
    expect(result).toEqual({
      feeAmount: 60_000,
      prizePool: 945_000,
      prizes: [661_500, 189_000, 94_500],
    });
  });

  it("고유 참여자 2명 이하는 이월하고 3명부터 추첨한다", () => {
    expect(hasEnoughLotteryParticipants(0)).toBe(false);
    expect(hasEnoughLotteryParticipants(2)).toBe(false);
    expect(hasEnoughLotteryParticipants(3)).toBe(true);
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
