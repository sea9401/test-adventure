import { describe, it, expect } from "vitest";
import {
  rollLevelGrowth,
  computeStatFloors,
  V2_GROWTH_POINTS_PER_LEVEL,
} from "./statGrowth";
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

describe("v2 스탯 floor", () => {
  it("computeStatFloors — 총(전 스탯) + 직군 누적레벨(프로필·차수 가중)", () => {
    // 검술(swordsman) cumLevel 200, tier1. 총=200×0.015=3(전 스탯). 직군: str(앵커1.0)·dex/luk(0.4).
    // 입력 earned→cumLevel 전환(2026-06): FLOOR_GLOBAL 0.015·FLOOR_PER_PROF 0.05.
    const prof = parseProficiency({
      groups: {
        swordsman: {
          earned: 10,
          spent: 0,
          cultivations: 0,
          tier: 1,
          cumLevel: 200,
        },
      },
    });
    const f = computeStatFloors(prof);
    // str = base + 3(총) + 200×0.05×1×1.0 = base + 3 + 10
    expect(f.str).toBe(V2_BASE_STATS.str + 3 + 10);
    // dex = base + 3(총) + 200×0.05×1×0.4 = base + 3 + 4
    expect(f.dex).toBe(V2_BASE_STATS.dex + 3 + 4);
    // int(프로필 외) = base + 3(총만)
    expect(f.int).toBe(V2_BASE_STATS.int + 3);
  });

  it("computeStatFloors — 차수 높을수록 floor↑, 빈 숙련도는 base", () => {
    const mk = (tier: number) =>
      computeStatFloors(
        parseProficiency({
          groups: {
            swordsman: {
              earned: 10,
              spent: 0,
              cultivations: 0,
              tier,
              cumLevel: 200,
            },
          },
        }),
      );
    expect(mk(3).str).toBeGreaterThan(mk(1).str);
    expect(computeStatFloors(emptyProficiency()).str).toBe(V2_BASE_STATS.str);
  });

  it("computeStatFloors — cumLevel 0(미적립)이면 직군 가중 없음, base + 총만", () => {
    // earned 만 있고 cumLevel 0 → 직군 floor 기여 없음(입력이 cumLevel 이므로).
    const prof = parseProficiency({
      groups: {
        swordsman: { earned: 9999, spent: 0, cultivations: 0, tier: 4, cumLevel: 0 },
      },
    });
    const f = computeStatFloors(prof);
    expect(f.str).toBe(V2_BASE_STATS.str);
  });
});
