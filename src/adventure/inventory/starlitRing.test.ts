import { describe, it, expect } from "vitest";
import {
  rollStarlitRingBonus,
  starlitRingStatsFromBonus,
  isValidStarlitRingBonus,
  STARLIT_RING_STAT_KEYS,
  STARLIT_RING_OPTION_COUNT,
  STARLIT_RING_OPTION_MAX,
} from "./starlitRing";

// 주어진 시퀀스를 순서대로 뱉는 가짜 rand (테스트 결정성).
function seqRand(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe("rollStarlitRingBonus", () => {
  it("정확히 2개의 서로 다른 스탯이 붙는다", () => {
    for (let n = 0; n < 200; n++) {
      const b = rollStarlitRingBonus();
      const keys = Object.keys(b);
      expect(keys).toHaveLength(STARLIT_RING_OPTION_COUNT);
      expect(new Set(keys).size).toBe(STARLIT_RING_OPTION_COUNT); // 중복 없음
      for (const k of keys) {
        expect(STARLIT_RING_STAT_KEYS as readonly string[]).toContain(k);
      }
    }
  });

  it("각 수치는 1 ~ MAX 범위", () => {
    for (let n = 0; n < 500; n++) {
      const b = rollStarlitRingBonus();
      for (const v of Object.values(b)) {
        expect(v).toBeGreaterThanOrEqual(1);
        expect(v).toBeLessThanOrEqual(STARLIT_RING_OPTION_MAX);
        expect(Number.isInteger(v)).toBe(true);
      }
    }
  });

  it("rand 0 이면 첫 두 스탵 + 수치 1, rand≈1 이면 마지막 조합 + 수치 MAX", () => {
    // rand=0: 셔플 j=i (제자리), 수치 floor(0*MAX)+1 = 1.
    const low = rollStarlitRingBonus(seqRand([0]));
    expect(low).toEqual({ str: 1, vit: 1 });
    // rand=0.999…: 수치 floor(0.999*20)+1 = 20.
    const high = rollStarlitRingBonus(seqRand([0.999999]));
    for (const v of Object.values(high)) expect(v).toBe(STARLIT_RING_OPTION_MAX);
    expect(Object.keys(high)).toHaveLength(2);
  });

  it("충분히 굴리면 5개 스탯이 모두 등장 (분산 확인)", () => {
    const seen = new Set<string>();
    for (let n = 0; n < 1000; n++) {
      for (const k of Object.keys(rollStarlitRingBonus())) seen.add(k);
    }
    expect(seen.size).toBe(STARLIT_RING_STAT_KEYS.length);
  });
});

describe("isValidStarlitRingBonus", () => {
  it("정상 롤은 통과", () => {
    expect(isValidStarlitRingBonus({ str: 12, luk: 20 })).toBe(true);
    expect(isValidStarlitRingBonus(rollStarlitRingBonus())).toBe(true);
  });
  it("개수/범위/키 위반은 거부", () => {
    expect(isValidStarlitRingBonus({ str: 5 })).toBe(false); // 1개
    expect(isValidStarlitRingBonus({ str: 5, vit: 5, dex: 5 })).toBe(false); // 3개
    expect(isValidStarlitRingBonus({ str: 0, vit: 5 })).toBe(false); // 0 (1 미만)
    expect(isValidStarlitRingBonus({ str: 21, vit: 5 })).toBe(false); // MAX 초과
    expect(isValidStarlitRingBonus({ atk: 5, vit: 5 })).toBe(false); // 허용 안 된 키
    expect(isValidStarlitRingBonus({ str: 5.5, vit: 5 })).toBe(false); // 비정수
    expect(isValidStarlitRingBonus(null)).toBe(false);
  });
});

describe("starlitRingStatsFromBonus", () => {
  it("bonus → 표시용 stats", () => {
    expect(starlitRingStatsFromBonus({ str: 12, luk: 20 })).toEqual([
      { label: "힘", value: "+12" },
      { label: "행운", value: "+20" },
    ]);
  });
});
