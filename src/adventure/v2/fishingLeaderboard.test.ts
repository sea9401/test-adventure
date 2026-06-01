import { describe, it, expect } from "vitest";
import { shapeLeaderboard, type LeaderboardRow } from "./fishingLeaderboard";

function row(fishId: string, userId: string, size: number, name: string | null = userId): LeaderboardRow {
  return { fishId, userId, name, size };
}

describe("shapeLeaderboard", () => {
  it("종별 위치 기반 rank 부여(사이즈 내림차순 입력)", () => {
    const rows = [
      row("carp", "a", 90),
      row("carp", "b", 70),
      row("carp", "c", 50),
    ];
    const byFish = shapeLeaderboard(rows, "z", 10);
    expect(byFish.carp.map((e) => [e.rank, e.name, e.size])).toEqual([
      [1, "a", 90],
      [2, "b", 70],
      [3, "c", 50],
    ]);
    expect(byFish.carp.every((e) => !e.isMe)).toBe(true);
  });

  it("top-N 컷 — 본인이 top 밖이어도 본인 행은 남는다", () => {
    const rows: LeaderboardRow[] = [];
    for (let i = 0; i < 12; i += 1) rows.push(row("trout", `u${i}`, 100 - i));
    rows.push(row("trout", "me", 1)); // 맨 아래(rank 13)
    // 입력은 size desc 가정 — me 를 맨 끝에 둠.
    const byFish = shapeLeaderboard(rows, "me", 10);
    const ranks = byFish.trout.map((e) => e.rank);
    // top-10 (1..10) + 본인 13위.
    expect(ranks).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 13]);
    expect(byFish.trout.find((e) => e.rank === 13)?.isMe).toBe(true);
  });

  it("본인이 top 안이면 isMe 만 표시되고 중복 없음", () => {
    const rows = [row("pike", "me", 80), row("pike", "x", 60)];
    const byFish = shapeLeaderboard(rows, "me", 10);
    expect(byFish.pike).toHaveLength(2);
    expect(byFish.pike[0].isMe).toBe(true);
    expect(byFish.pike[1].isMe).toBe(false);
  });

  it("이름 누락/공백은 모험가로 폴백", () => {
    const byFish = shapeLeaderboard(
      [row("goby", "a", 10, null), row("goby", "b", 9, "   ")],
      "z",
    );
    expect(byFish.goby[0].name).toBe("모험가");
    expect(byFish.goby[1].name).toBe("모험가");
  });

  it("여러 종을 독립적으로 그룹핑", () => {
    const byFish = shapeLeaderboard(
      [row("carp", "a", 50), row("trout", "a", 40), row("trout", "b", 30)],
      "z",
    );
    expect(Object.keys(byFish).sort()).toEqual(["carp", "trout"]);
    expect(byFish.carp).toHaveLength(1);
    expect(byFish.trout).toHaveLength(2);
  });
});
