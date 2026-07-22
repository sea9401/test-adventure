import { describe, expect, it } from "vitest";
import { drawLotteryTickets } from "./lotteryDraw";

describe("drawLotteryTickets", () => {
  const secret = "0123456789abcdef".repeat(4);

  it("같은 회차와 공개 비밀값이면 결과를 재현할 수 있다", () => {
    expect(drawLotteryTickets(100, secret, 42)).toEqual(
      drawLotteryTickets(100, secret, 42),
    );
  });

  it("범위 안의 서로 다른 티켓 세 장만 뽑는다", () => {
    const result = drawLotteryTickets(10, secret, 7);
    expect(result).toHaveLength(3);
    expect(new Set(result).size).toBe(3);
    expect(result.every((ticket) => ticket >= 1 && ticket <= 10)).toBe(true);
  });

  it("판매 티켓보다 많은 당첨 번호 요청은 거부한다", () => {
    expect(() => drawLotteryTickets(2, secret, 1, 3)).toThrow(
      "invalid lottery draw size",
    );
  });
});
