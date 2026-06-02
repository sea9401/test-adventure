import { describe, expect, it } from "vitest";
import {
  FLOOR_DROP_POOLS,
  V2_MATERIALS,
  mergeDrops,
  rollDrops,
  type V2MaterialId,
} from "./dungeonDrops";

// 2026-06-03: v2 재료 시스템 보류 — 카탈로그/전 층 드랍 풀 비움. mergeDrops 는 카탈로그
// 무관(임의 키 합산)이라 그대로 유효 → 보유분 비파괴 보장 회귀 가드로 유지.

describe("재료 보류 (V2_MATERIALS / FLOOR_DROP_POOLS)", () => {
  it("재료 카탈로그가 비어 있음", () => {
    expect(Object.keys(V2_MATERIALS)).toHaveLength(0);
  });

  it("전 층 드랍 풀이 비어 있음", () => {
    for (const pool of Object.values(FLOOR_DROP_POOLS)) {
      expect(pool).toEqual([]);
    }
  });
});

describe("rollDrops", () => {
  it("어느 층이든 빈 풀이라 항상 빈 결과 (신참 배율도 무관)", () => {
    const rng = () => 0; // 통과시키려 해도 풀이 비어 결과 없음
    for (const f of [1, 2, 3, 4, 5, 6, 7, 8] as const) {
      expect(rollDrops(f, rng)).toEqual({});
      expect(rollDrops(f, rng, 2)).toEqual({});
    }
  });
});

describe("mergeDrops", () => {
  it("빈 기존 + 새 drops = drops 그대로", () => {
    const drops = { v2_stone_chip: 2, v2_herb: 1 } as const;
    expect(mergeDrops(null, drops)).toEqual({ v2_stone_chip: 2, v2_herb: 1 });
    expect(mergeDrops({}, drops)).toEqual({ v2_stone_chip: 2, v2_herb: 1 });
  });

  it("기존 + 새 drops 합산", () => {
    const existing = { v2_stone_chip: 3, v2_herb: 5 };
    const drops = { v2_stone_chip: 2, v2_bone_fragment: 1 } as const;
    expect(mergeDrops(existing, drops)).toEqual({
      v2_stone_chip: 5,
      v2_herb: 5,
      v2_bone_fragment: 1,
    });
  });

  it("기존의 임의 키도 보존 (다른 시스템·옛 재료 누적분 비파괴)", () => {
    const existing = { live_iron_ore: 4, v2_stone_chip: 1 };
    const drops: Partial<Record<V2MaterialId, number>> = { v2_stone_chip: 2 };
    expect(mergeDrops(existing, drops)).toEqual({
      live_iron_ore: 4,
      v2_stone_chip: 3,
    });
  });

  it("기존이 손상된 모양이면 무시 (NaN/음수/문자열 등)", () => {
    const existing = {
      v2_stone_chip: NaN,
      v2_herb: -3,
      v2_bone_fragment: "five",
      v2_starlit_dust: 2,
    };
    const drops: Partial<Record<V2MaterialId, number>> = { v2_herb: 1 };
    expect(mergeDrops(existing, drops)).toEqual({
      v2_starlit_dust: 2,
      v2_herb: 1,
    });
  });

  it("drops 의 0 또는 음수 amount 는 누적 X", () => {
    const existing = { v2_stone_chip: 1 };
    const drops = { v2_stone_chip: 0, v2_herb: -1 } as DropResult;
    expect(mergeDrops(existing, drops)).toEqual({ v2_stone_chip: 1 });
  });
});

type DropResult = Partial<Record<V2MaterialId, number>>;
