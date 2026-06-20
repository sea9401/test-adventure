import { describe, it, expect } from "vitest";
import {
  reduceAllTimeBest,
  shapeLeaderboard,
  type LeaderboardRow,
} from "./fishingLeaderboard";

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

describe("reduceAllTimeBest (역대 최대어 집계)", () => {
  it("(fish,user) 별 최대 사이즈만 남긴다 — 같은 유저 여러 시즌 기록 중 최대", () => {
    const rows = [
      row("carp", "a", 80), // a 의 carp 최대
      row("carp", "a", 50), // 같은 유저 더 작은 기록 → 버림
      row("carp", "b", 60),
    ];
    const out = reduceAllTimeBest(rows);
    expect(out.filter((r) => r.fishId === "carp" && r.userId === "a")).toEqual([
      { fishId: "carp", userId: "a", name: "a", size: 80 },
    ]);
    expect(out).toHaveLength(2); // a(80), b(60)
  });

  it("fishId 오름차순·size 내림차순 정렬(shapeLeaderboard 입력 계약)", () => {
    const out = reduceAllTimeBest([
      row("trout", "b", 30),
      row("carp", "a", 50),
      row("trout", "a", 90),
      row("carp", "c", 70),
    ]);
    expect(out.map((r) => [r.fishId, r.userId, r.size])).toEqual([
      ["carp", "c", 70],
      ["carp", "a", 50],
      ["trout", "a", 90],
      ["trout", "b", 30],
    ]);
  });

  it("집계 결과를 shapeLeaderboard 에 넘기면 역대 순위가 된다(시즌 무관 통합)", () => {
    // 같은 유저 a 가 두 시즌에 trout 70/95 → 역대 95 한 줄로만.
    const all = reduceAllTimeBest([
      row("trout", "a", 70),
      row("trout", "a", 95),
      row("trout", "b", 88),
    ]);
    const byFish = shapeLeaderboard(all, "b", 10);
    expect(byFish.trout.map((e) => [e.rank, e.name, e.size, e.isMe])).toEqual([
      [1, "a", 95, false],
      [2, "b", 88, true],
    ]);
  });

  it("빈 입력 → 빈 배열", () => {
    expect(reduceAllTimeBest([])).toEqual([]);
  });
});
