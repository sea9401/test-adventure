import { describe, it, expect } from "vitest";
import { rollLevelGrowth, V2_GROWTH_POINTS_PER_LEVEL } from "./statGrowth";
import { emptyProficiency, parseProficiency } from "./proficiency";
import { V2_BASE_STATS } from "./v2Stats";

describe("v2 랜덤 레벨 성장", () => {
  it("레벨 1회 = POINTS 만큼 +1 (cap 여유 시)", () => {
    const grown = rollLevelGrowth({}, "swordsman", emptyProficiency(), () => 0.5);
    const total = Object.values(grown).reduce((a, b) => a + (b ?? 0), 0);
    expect(total).toBe(V2_GROWTH_POINTS_PER_LEVEL);
  });

  it("앵커 가중 — rng 가 앵커 구간(작은 값)이면 앵커에 몰림", () => {
    // 검사(swordsman) 앵커=str(가중 3/8). rng=0.1 → 매 포인트 str 선택.
    const grown = rollLevelGrowth({}, "swordsman", emptyProficiency(), () => 0.1);
    expect(grown.str).toBe(V2_GROWTH_POINTS_PER_LEVEL);
    expect(grown.int).toBeUndefined();
  });

  it("cap 에서 멈춤 — 앵커가 cap 가득이면 그 포인트는 다른 스탯으로(낭비 없음)", () => {
    const prof = parseProficiency({ groups: {}, caps: {} }); // 전 스탯 cap = 60 기본
    const base = V2_BASE_STATS.str;
    const grown0 = { str: 60 - base }; // str 이미 cap(60)
    const grown = rollLevelGrowth(grown0, "swordsman", prof, () => 0.1);
    expect(grown.str).toBe(60 - base); // 안 오름
    const total = Object.values(grown).reduce((a, b) => a + (b ?? 0), 0);
    expect(total).toBe(60 - base + V2_GROWTH_POINTS_PER_LEVEL); // 5점 다른 스탯
  });

  it("none(무직) = 균등 가중, 비파괴", () => {
    const grown0 = { str: 2 };
    const grown = rollLevelGrowth(grown0, "none", emptyProficiency(), () => 0.99);
    const total = Object.values(grown).reduce((a, b) => a + (b ?? 0), 0);
    expect(total).toBe(2 + V2_GROWTH_POINTS_PER_LEVEL);
    expect(grown0.str).toBe(2); // 원본 비파괴
  });
});
