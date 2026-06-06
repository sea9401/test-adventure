import { describe, expect, it } from "vitest";
import {
  FLOOR_DROP_POOLS,
  V2_MATERIALS,
  V2_MATERIALS_ENABLED,
  mergeDrops,
  rollDrops,
  type V2MaterialId,
} from "./dungeonDrops";

// 2026-06-03: 재료 재설계 — 지역당 소수(희귀 2 + 흔함 3~4), 저드랍. 현재 들판(1층)만 등재.

const FIELD_IDS = [
  "v2_field_grass",
  "v2_field_hide",
  "v2_field_stone",
  "v2_field_fang",
  "v2_field_venom",
];

describe("들판 재료 + 드랍 풀", () => {
  it("들판 재료 5종 등재(흔함 3 + 희귀 2)", () => {
    expect(Object.keys(V2_MATERIALS).sort()).toEqual([...FIELD_IDS].sort());
  });

  it("1층 풀 id 가 전부 카탈로그에 존재, 2~8층은 빈 풀", () => {
    for (const rule of FLOOR_DROP_POOLS[1]) {
      expect(V2_MATERIALS[rule.id]).toBeDefined();
    }
    expect(FLOOR_DROP_POOLS[1]).toHaveLength(5);
    for (const f of [2, 3, 4, 5, 6, 7, 8] as const) {
      expect(FLOOR_DROP_POOLS[f]).toEqual([]);
    }
  });

  it("저드랍 — 희귀 ≤ 0.06, 흔함 ≤ 0.12 (잡재료 범람 방지)", () => {
    const byId = Object.fromEntries(
      FLOOR_DROP_POOLS[1].map((r) => [r.id, r.chance]),
    );
    expect(byId.v2_field_fang).toBeLessThanOrEqual(0.06);
    expect(byId.v2_field_venom).toBeLessThanOrEqual(0.06);
    expect(byId.v2_field_grass).toBeLessThanOrEqual(0.12);
    expect(byId.v2_field_hide).toBeLessThanOrEqual(0.12);
    expect(byId.v2_field_stone).toBeLessThanOrEqual(0.12);
  });
});

describe("rollDrops", () => {
  it("들판(1층) — 통과 굴림이면 등재 재료 획득 (재료 보류 시엔 빈 결과)", () => {
    const result = rollDrops(1, () => 0);
    if (V2_MATERIALS_ENABLED) {
      for (const id of FIELD_IDS) expect(result[id]).toBe(1);
    } else {
      // 재료 보류 중 — 어떤 굴림이든 드랍 없음(단일 게이트).
      expect(result).toEqual({});
    }
  });

  it("굴림이 모두 chance 이상이면 빈 결과", () => {
    expect(rollDrops(1, () => 0.99)).toEqual({});
  });

  it("들판 외(2~8층)은 빈 풀이라 항상 빈 결과", () => {
    for (const f of [2, 3, 4, 5, 6, 7, 8] as const) {
      expect(rollDrops(f, () => 0)).toEqual({});
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
