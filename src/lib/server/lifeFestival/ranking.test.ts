import { describe, expect, it } from "vitest";
import {
  computeLifeFestivalPayouts,
  lifeFestivalRankTokens,
  rankLifeFestivalRows,
} from "./ranking";

const NOW = new Date("2026-10-12T00:10:00+09:00");

function row(userId: string, score: number, minute = 0, bannedUntil: Date | null = null) {
  return {
    userId,
    score,
    updatedAt: new Date(Date.UTC(2026, 9, 10, 0, minute)),
    bannedUntil,
  };
}

describe("생활 축제 순위", () => {
  it("순위별 보상 증표", () => {
    expect([1, 2, 3, 4, 10, 11, 30, 31].map(lifeFestivalRankTokens)).toEqual([
      100, 60, 60, 30, 30, 10, 10, 0,
    ]);
  });

  it("점수 내림차순, 동점은 먼저 도달한 쪽이 위다", () => {
    const ranked = rankLifeFestivalRows(
      [row("late", 50, 9), row("top", 90), row("early", 50, 1)],
      NOW,
    );
    expect(ranked.map((entry) => [entry.userId, entry.rank])).toEqual([
      ["top", 1],
      ["early", 2],
      ["late", 3],
    ]);
  });

  it("정지 중인 계정과 0점은 순위에서 빠진다", () => {
    const ranked = rankLifeFestivalRows(
      [
        row("banned", 100, 0, new Date("2099-01-01T00:00:00Z")),
        row("expiredBan", 80, 0, new Date("2026-01-01T00:00:00Z")),
        row("zero", 0),
      ],
      NOW,
    );
    expect(ranked.map((entry) => entry.userId)).toEqual(["expiredBan"]);
    expect(ranked[0].rank).toBe(1);
  });

  it("상위 30명에게만 보상을 나눈다", () => {
    const rows = Array.from({ length: 35 }, (_, index) => row(`u${index}`, 1_000 - index));
    const payouts = computeLifeFestivalPayouts(rows, NOW);
    expect(payouts).toHaveLength(30);
    expect(payouts.reduce((sum, payout) => sum + payout.tokens, 0)).toBe(
      100 + 60 * 2 + 30 * 7 + 10 * 20,
    );
    expect(payouts[0]).toEqual({ userId: "u0", rank: 1, tokens: 100 });
  });
});
