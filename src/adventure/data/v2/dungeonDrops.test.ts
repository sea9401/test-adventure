import { describe, expect, it } from "vitest";
import {
  FLOOR_DROP_POOLS,
  V2_MATERIALS,
  mergeDrops,
  rollDrops,
  type V2MaterialId,
} from "./dungeonDrops";

// 2026-06-08: 재료 콘텐츠 제거 — 등재 재료 0종, 전 층 드랍 풀 빈 상태. 순수 헬퍼(rollDrops/
// mergeDrops)는 보존하므로 빈 카탈로그에서의 안전 동작을 검증한다. mergeDrops 는 카탈로그
// 비의존(임의 키 합산)이라 합성 키로 계약을 그대로 검증한다.

describe("재료 카탈로그 + 드랍 풀 (제거됨)", () => {
  it("등재 재료 0종", () => {
    expect(Object.keys(V2_MATERIALS)).toHaveLength(0);
  });

  it("전 층(1~8) 드랍 풀이 빈 상태", () => {
    for (const f of [1, 2, 3, 4, 5, 6, 7, 8] as const) {
      expect(FLOOR_DROP_POOLS[f]).toEqual([]);
    }
  });
});

describe("rollDrops", () => {
  it("어떤 층·굴림이든 빈 결과 (드랍 풀 비었고 재료 보류)", () => {
    for (const f of [1, 2, 3, 4, 5, 6, 7, 8] as const) {
      expect(rollDrops(f, () => 0)).toEqual({});
      expect(rollDrops(f, () => 0.99)).toEqual({});
    }
  });
});

describe("mergeDrops", () => {
  it("빈 기존 + 새 drops = drops 그대로", () => {
    const drops = { v2_field_grass: 2, v2_field_stone: 1 } as const;
    expect(mergeDrops(null, drops)).toEqual({
      v2_field_grass: 2,
      v2_field_stone: 1,
    });
    expect(mergeDrops({}, drops)).toEqual({
      v2_field_grass: 2,
      v2_field_stone: 1,
    });
  });

  it("기존 + 새 drops 합산", () => {
    const existing = { v2_field_grass: 3, v2_field_stone: 5 };
    const drops = { v2_field_grass: 2, v2_field_fang: 1 } as const;
    expect(mergeDrops(existing, drops)).toEqual({
      v2_field_grass: 5,
      v2_field_stone: 5,
      v2_field_fang: 1,
    });
  });

  it("기존의 임의 키도 보존 (다른 시스템·옛 재료 누적분 비파괴)", () => {
    const existing = { v2_stone_chip: 4, v2_field_grass: 1 };
    const drops: Partial<Record<V2MaterialId, number>> = { v2_field_grass: 2 };
    expect(mergeDrops(existing, drops)).toEqual({
      v2_stone_chip: 4,
      v2_field_grass: 3,
    });
  });

  it("기존이 손상된 모양이면 무시 (NaN/음수/문자열 등)", () => {
    const existing = {
      v2_field_grass: NaN,
      v2_field_hide: -3,
      v2_field_stone: "five",
      v2_field_fang: 2,
    };
    const drops: Partial<Record<V2MaterialId, number>> = { v2_field_hide: 1 };
    expect(mergeDrops(existing, drops)).toEqual({
      v2_field_fang: 2,
      v2_field_hide: 1,
    });
  });

  it("drops 의 0 또는 음수 amount 는 누적 X", () => {
    const existing = { v2_field_grass: 1 };
    const drops = { v2_field_grass: 0, v2_field_hide: -1 } as DropResult;
    expect(mergeDrops(existing, drops)).toEqual({ v2_field_grass: 1 });
  });
});

type DropResult = Partial<Record<V2MaterialId, number>>;
