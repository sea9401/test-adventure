import { describe, it, expect } from "vitest";
import {
  FISH,
  FISH_IDS,
  FISH_TIERS,
  FISH_TIER_ORDER,
  FISH_TOTAL,
  isFishId,
  pickFishId,
  recordCoinForRank,
  rollFishSize,
  type FishTier,
} from "./fish";

// 결정적 시드 RNG (mulberry32) — 분포·경계 테스트용.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TIER_COUNTS: Record<FishTier, number> = {
  common: 6,
  uncommon: 7,
  rare: 7,
  epic: 6,
  legendary: 4,
};

describe("어종 카탈로그", () => {
  it("총 30종 + 티어별 6/7/7/6/4 구성", () => {
    expect(FISH_TOTAL).toBe(30);
    for (const tier of FISH_TIER_ORDER) {
      const count = FISH_IDS.filter((id) => FISH[id].tier === tier).length;
      expect(count).toBe(TIER_COUNTS[tier]);
    }
  });

  it("키와 id 일치 + 이름 고유 + min<max", () => {
    const names = new Set<string>();
    for (const id of FISH_IDS) {
      const f = FISH[id];
      expect(f.id).toBe(id);
      expect(f.minSize).toBeGreaterThan(0);
      expect(f.maxSize).toBeGreaterThan(f.minSize);
      expect(names.has(f.name)).toBe(false);
      names.add(f.name);
    }
  });

  it("isFishId 판정", () => {
    expect(isFishId("crucian_carp")).toBe(true);
    expect(isFishId("not_a_fish")).toBe(false);
  });
});

describe("사이즈 굴림 (heavy-tail)", () => {
  it("rng=0 이면 하한, rng→1 이면 상한 근처(상한 초과 없음)", () => {
    for (const id of FISH_IDS) {
      const f = FISH[id];
      expect(rollFishSize(id, () => 0)).toBe(f.minSize);
      const near = rollFishSize(id, () => 0.999999);
      expect(near).toBeLessThanOrEqual(f.maxSize);
      expect(near).toBeGreaterThan((f.minSize + f.maxSize) / 2);
    }
  });

  it("항상 [min, max] 범위, 0.1 단위", () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 5000; i += 1) {
      const id = FISH_IDS[i % FISH_IDS.length];
      const f = FISH[id];
      const s = rollFishSize(id, rng);
      expect(s).toBeGreaterThanOrEqual(f.minSize);
      expect(s).toBeLessThanOrEqual(f.maxSize);
      expect(Math.round(s * 10)).toBe(s * 10);
    }
  });

  it("k>1 로 대물은 희박 — 중앙값이 중점보다 한참 아래", () => {
    const rng = mulberry32(7);
    const id = "crucian_carp"; // common, k=3
    const f = FISH[id];
    const samples: number[] = [];
    for (let i = 0; i < 4000; i += 1) samples.push(rollFishSize(id, rng));
    samples.sort((a, b) => a - b);
    const median = samples[Math.floor(samples.length / 2)];
    const midpoint = (f.minSize + f.maxSize) / 2;
    expect(median).toBeLessThan(midpoint);
    // 상한 90% 이상 대물은 전체의 극히 일부.
    const big = samples.filter((s) => s >= f.minSize + 0.9 * (f.maxSize - f.minSize));
    expect(big.length / samples.length).toBeLessThan(0.05);
  });
});

describe("종 추첨 (encounter)", () => {
  it("항상 유효한 어종을 반환", () => {
    const rng = mulberry32(123);
    for (let i = 0; i < 2000; i += 1) {
      const id = pickFishId(rng);
      expect(isFishId(id)).toBe(true);
    }
  });

  it("흔함이 전설보다 훨씬 자주 걸린다", () => {
    const rng = mulberry32(999);
    const tierHits: Record<FishTier, number> = {
      common: 0,
      uncommon: 0,
      rare: 0,
      epic: 0,
      legendary: 0,
    };
    const N = 40000;
    for (let i = 0; i < N; i += 1) tierHits[FISH[pickFishId(rng)].tier] += 1;
    // 모든 티어가 적어도 한 번은 등장.
    for (const tier of FISH_TIER_ORDER) expect(tierHits[tier]).toBeGreaterThan(0);
    expect(tierHits.common).toBeGreaterThan(tierHits.legendary * 5);
    // 흔함 비율이 대략 가중치(40/100)에 근접.
    expect(tierHits.common / N).toBeGreaterThan(0.3);
    expect(tierHits.common / N).toBeLessThan(0.5);
  });
});

describe("종별 기록 보상 코인", () => {
  it("순위 경계: 1/2/3/4~10/11+", () => {
    const id = "crucian_carp"; // common 18/11/7/4
    expect(recordCoinForRank(id, 1)).toBe(18);
    expect(recordCoinForRank(id, 2)).toBe(11);
    expect(recordCoinForRank(id, 3)).toBe(7);
    expect(recordCoinForRank(id, 4)).toBe(4);
    expect(recordCoinForRank(id, 10)).toBe(4);
    expect(recordCoinForRank(id, 11)).toBe(0);
    expect(recordCoinForRank(id, 0)).toBe(0);
  });

  it("전설 1등이 흔함 1등보다 크다", () => {
    expect(FISH_TIERS.legendary.recordCoins.rank1).toBeGreaterThan(
      FISH_TIERS.common.recordCoins.rank1,
    );
  });
});
