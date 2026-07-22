import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { LotteryRoundResultView } from "@/lib/lottery";
import { LotteryRoundResultCard } from "./LotteryRoom";

function result(
  overrides: Partial<LotteryRoundResultView> = {},
): LotteryRoundResultView {
  return {
    id: 42,
    status: "settled",
    totalTickets: 18,
    participantCount: 6,
    grossPool: 2_700_000,
    carryIn: 0,
    feeAmount: 270_000,
    prizePool: 2_430_000,
    settledAt: Date.UTC(2026, 6, 23),
    commitHash: "commit-42",
    revealSecret: "secret-42",
    winners: [
      {
        rank: 1,
        actorName: "우승자",
        ticketNumber: 7,
        prizeAmount: 1_701_000,
        mine: true,
      },
    ],
    ...overrides,
  };
}

describe("LotteryRoundResultCard", () => {
  it("지난 회차의 당첨자·티켓·상금을 표시한다", () => {
    const html = renderToStaticMarkup(
      <LotteryRoundResultCard round={result()} />,
    );

    expect(html).toContain("제 42회 추첨 결과");
    expect(html).toContain("참여 6명 · 판매 18장");
    expect(html).toContain("1등 우승자 · #7 · 1,701,000G (나)");
  });

  it("미추첨 회차는 이월 결과를 표시한다", () => {
    const html = renderToStaticMarkup(
      <LotteryRoundResultCard
        round={
          result({
            status: "rolled_over",
            participantCount: 2,
            prizePool: 900_000,
            winners: [],
          })
        }
      />,
    );

    expect(html).toContain("추첨 없이 상금 900,000G");
    expect(html).toContain("다음 회차로 이월되었습니다.");
  });
});
