import { describe, it, expect } from "vitest";
import { shapeTreasureLeaderboard } from "./treasureLeaderboard";

describe("shapeTreasureLeaderboard", () => {
  it("내림차순 표준 경쟁 순위 + top-N + 본인 행", () => {
    const rows = [
      { userId: "a", name: "A", value: 100 },
      { userId: "b", name: null, value: 50 },
      { userId: "c", name: "C", value: 50 }, // b 와 동률 2위
      { userId: "me", name: "Me", value: 10 }, // 4위(top 밖)지만 본인
    ];
    const out = shapeTreasureLeaderboard(rows, "me", 2);
    expect(out).toEqual([
      { rank: 1, name: "A", value: 100, isMe: false },
      { rank: 2, name: "모험가", value: 50, isMe: false }, // null → fallback
      { rank: 2, name: "C", value: 50, isMe: false },
      { rank: 4, name: "Me", value: 10, isMe: true }, // top 밖이지만 본인이라 포함
    ]);
  });

  it("top-N 안이면 본인도 한 번만", () => {
    const rows = [
      { userId: "me", name: "Me", value: 100 },
      { userId: "b", name: "B", value: 50 },
    ];
    const out = shapeTreasureLeaderboard(rows, "me", 10);
    expect(out.filter((e) => e.isMe)).toHaveLength(1);
    expect(out[0]).toMatchObject({ rank: 1, isMe: true });
  });

  it("빈 입력 → 빈 배열", () => {
    expect(shapeTreasureLeaderboard([], "me", 10)).toEqual([]);
  });
});
