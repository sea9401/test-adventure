import { describe, expect, it } from "vitest";
import {
  FLOOR_DROP_POOLS,
  V2_MATERIALS,
  mergeDrops,
  rollDrops,
  type V2MaterialId,
} from "./dungeonDrops";

// 결정적 rng — 미리 정한 시퀀스를 순서대로 뱉음. 끝나면 0 반복.
function seqRng(values: number[]): () => number {
  let i = 0;
  return () => (i < values.length ? values[i++] : 0);
}

describe("V2_MATERIALS", () => {
  it("모든 풀의 id 가 V2_MATERIALS 에 정의되어 있어야 함", () => {
    for (const pool of Object.values(FLOOR_DROP_POOLS)) {
      for (const rule of pool) {
        expect(V2_MATERIALS[rule.id]).toBeDefined();
      }
    }
  });
});

describe("rollDrops", () => {
  it("rng 가 모두 chance 이상이면 빈 결과", () => {
    const rng = seqRng([1, 1, 1, 1, 1, 1]);
    expect(rollDrops(1, rng)).toEqual({});
  });

  it("rng 가 모두 0 이면 모든 룰 통과 + amountMin 획득", () => {
    // 1층 룰 3개. 각 룰: chance 통과(0) + amount 굴림(0=Min).
    const rng = seqRng([0, 0, 0, 0, 0, 0]);
    const result = rollDrops(1, rng);
    expect(result.v2_stone_chip).toBe(1);
    expect(result.v2_herb).toBe(1);
    expect(result.v2_slime_shard).toBe(1);
  });

  it("rng 가 chance 경계값보다 살짝 작으면 통과", () => {
    // 1층 첫 룰 chance=0.5. 0.499 → 통과, 그 다음은 amount 굴림.
    // 두 번째 룰 chance=0.3 → 0.999 거부. 세 번째 chance=0.1 → 0.999 거부.
    const rng = seqRng([0.499, 0.99, 0.999, 0.999]);
    const result = rollDrops(1, rng);
    // amount=1+floor(0.99*2)=1+1=2
    expect(result.v2_stone_chip).toBe(2);
    expect(result.v2_herb).toBeUndefined();
    expect(result.v2_slime_shard).toBeUndefined();
  });

  it("6·7·8층(엔드)은 빈 풀이라 항상 빈 결과", () => {
    const rng = seqRng([0, 0, 0, 0, 0]);
    expect(rollDrops(6, rng)).toEqual({});
    expect(rollDrops(7, rng)).toEqual({});
    expect(rollDrops(8, rng)).toEqual({});
  });

  it("chanceMult(신참 ×2) — chance 를 2배(1 cap), 미지정 1 동작 불변", () => {
    // 1층 풀: stone 0.5 / herb 0.3 / slime 0.1. 상수 rng 0.55.
    const rng = () => 0.55;
    // 배율 1: 0.55 가 모든 chance 이상 → 드롭 없음 (미지정 기본도 동일).
    expect(rollDrops(1, rng)).toEqual({});
    expect(rollDrops(1, rng, 1)).toEqual({});
    // 배율 2: stone 0.5×2=1.0(cap)·herb 0.3×2=0.6 통과, slime 0.1×2=0.2 실패.
    const d = rollDrops(1, rng, 2);
    expect(d.v2_stone_chip).toBeGreaterThan(0);
    expect(d.v2_herb).toBeGreaterThan(0);
    expect(d.v2_slime_shard).toBeUndefined();
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

  it("기존의 V2 외 키도 보존 (다른 시스템 누적분 보호)", () => {
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
