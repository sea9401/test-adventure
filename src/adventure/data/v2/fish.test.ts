import { describe, it, expect } from "vitest";
import {
  FISH,
  FISH_IDS,
  FISH_TIERS,
  FISH_TIER_ORDER,
  FISH_TOTAL,
  BIG_CATCH_BONUS_ROLL_FRACTION,
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

function sequence(values: readonly number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

const TIER_COUNTS: Record<FishTier, number> = {
  common: 6,
  uncommon: 7,
  rare: 7,
  epic: 6,
  legendary: 4,
};

function countPickedTiers(
  seed: number,
  options?: Parameters<typeof pickFishId>[2],
): Record<FishTier, number> {
  const rng = mulberry32(seed);
  const hits: Record<FishTier, number> = {
    common: 0,
    uncommon: 0,
    rare: 0,
    epic: 0,
    legendary: 0,
  };
  for (let i = 0; i < 40000; i += 1) {
    hits[FISH[pickFishId(rng, undefined, options)].tier] += 1;
  }
  return hits;
}

describe("어종 카탈로그", () => {
  it("항상풀 30종(티어 6/7/7/6/4) + 물때 한정 4종 = 총 34", () => {
    expect(FISH_TOTAL).toBe(34);
    const always = FISH_IDS.filter((id) => FISH[id].condition === undefined);
    const special = FISH_IDS.filter((id) => FISH[id].condition !== undefined);
    expect(always.length).toBe(30);
    expect(special.length).toBe(4);
    // 티어 구성(6/7/7/6/4)은 항상풀 기준 — 특별 손님은 자기 티어에 얹힐 뿐.
    for (const tier of FISH_TIER_ORDER) {
      const count = always.filter((id) => FISH[id].tier === tier).length;
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

  it("크기 보정은 같은 굴림에서 물고기 크기를 상한 쪽으로만 올린다", () => {
    const id = "crucian_carp";
    const base = rollFishSize(id, () => 0.5);
    const boosted = rollFishSize(id, () => 0.5, { sizeBonusPct: 4 });
    expect(boosted).toBeGreaterThan(base);
    expect(boosted).toBeLessThanOrEqual(FISH[id].maxSize);
  });

  it("희귀 이상 크기 보정은 rare 이상 어종에만 적용된다", () => {
    const common = rollFishSize("crucian_carp", () => 0.5, {
      rareSizeBonusPct: 3,
    });
    expect(common).toBe(rollFishSize("crucian_carp", () => 0.5));

    const rareBase = rollFishSize("trout", () => 0.5);
    const rareBoosted = rollFishSize("trout", () => 0.5, {
      rareSizeBonusPct: 3,
    });
    expect(rareBoosted).toBeGreaterThan(rareBase);
    expect(rareBoosted).toBeLessThanOrEqual(FISH.trout.maxSize);
  });

  it("대물권 크기 보정은 상위 20% 굴림에서만 적용된다", () => {
    const belowRoll = Math.pow(BIG_CATCH_BONUS_ROLL_FRACTION - 0.01, 1 / 3);
    const aboveRoll = Math.pow(BIG_CATCH_BONUS_ROLL_FRACTION + 0.01, 1 / 3);
    expect(
      rollFishSize("crucian_carp", () => belowRoll, {
        bigCatchSizeBonusPct: 2,
      }),
    ).toBe(rollFishSize("crucian_carp", () => belowRoll));
    expect(
      rollFishSize("crucian_carp", () => aboveRoll, {
        bigCatchSizeBonusPct: 2,
      }),
    ).toBeGreaterThan(rollFishSize("crucian_carp", () => aboveRoll));
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

  it("티어 보정은 일일 과제용으로 낮은 등급 분포를 당길 수 있다", () => {
    const base = countPickedTiers(4401);
    const boosted = countPickedTiers(4401, {
      tierWeightPct: {
        common: 70,
        uncommon: 45,
        rare: 15,
        epic: -35,
        legendary: -55,
      },
    });
    expect(boosted.common + boosted.uncommon).toBeGreaterThan(
      base.common + base.uncommon,
    );
    expect(boosted.epic + boosted.legendary).toBeLessThan(
      base.epic + base.legendary,
    );
  });

  it("티어 보정은 희귀 중심 미끼도 표현할 수 있다", () => {
    const base = countPickedTiers(9901);
    const boosted = countPickedTiers(9901, {
      tierWeightPct: {
        common: -25,
        uncommon: -10,
        rare: 70,
        epic: 20,
      },
    });
    expect(boosted.rare).toBeGreaterThan(base.rare);
    expect(boosted.common).toBeLessThan(base.common);
  });
});

describe("물때 한정 특별 손님 추첨 게이트 (공정성 청정)", () => {
  it("조건 인자 없으면 특별 손님은 절대 안 나온다(항상풀 30종만)", () => {
    const rng = mulberry32(2024);
    for (let i = 0; i < 20000; i += 1) {
      expect(FISH[pickFishId(rng)].condition).toBeUndefined();
    }
  });

  it("그 물때를 주면 해당 손님은 등장 가능, 다른 물때 손님은 불가", () => {
    const rng = mulberry32(55);
    const seen = new Set<string>();
    for (let i = 0; i < 50000; i += 1) seen.add(pickFishId(rng, "dawn"));
    expect(seen.has("goldeye")).toBe(true); // dawn 손님 등장
    expect(seen.has("moonshadow_eel")).toBe(false); // starlit 손님 불가
    expect(seen.has("mist_koi")).toBe(false); // mist 손님 불가
    expect(seen.has("stormrider")).toBe(false); // tempest 손님 불가
    expect(seen.has("crucian_carp")).toBe(true); // 항상풀은 그대로
  });

  it("물때 보정은 현재 물때 한정 손님의 티어 내 가중치를 높인다", () => {
    // 0.70 = rare 티어, 0.86 = 균등 추첨이면 마지막 전 일반 희귀종, 25% 보정이면 dawn 손님(goldeye).
    expect(pickFishId(sequence([0.7, 0.86]), "dawn")).toBe("rainbow_trout");
    expect(
      pickFishId(sequence([0.7, 0.86]), "dawn", {
        specialWeightBonusPct: 25,
      }),
    ).toBe("goldeye");
  });

  it("특별 손님 없는 물때(still)면 항상풀만", () => {
    const rng = mulberry32(88);
    for (let i = 0; i < 20000; i += 1) {
      expect(FISH[pickFishId(rng, "still")].condition).toBeUndefined();
    }
  });

  it("무인자 추첨 == 손님 없는 물때(still) 추첨 — 같은 시드 같은 수열(항상풀 불변 증명)", () => {
    const a = mulberry32(31);
    const b = mulberry32(31);
    for (let i = 0; i < 5000; i += 1) {
      expect(pickFishId(a)).toBe(pickFishId(b, "still"));
    }
  });
});

describe("종별 기록 보상 코인", () => {
  it("순위 경계: 1/2/3/4~10/11+", () => {
    const id = "crucian_carp"; // common 36/22/14/8 (2026-06-27 ×2)
    expect(recordCoinForRank(id, 1)).toBe(36);
    expect(recordCoinForRank(id, 2)).toBe(22);
    expect(recordCoinForRank(id, 3)).toBe(14);
    expect(recordCoinForRank(id, 4)).toBe(8);
    expect(recordCoinForRank(id, 10)).toBe(8);
    expect(recordCoinForRank(id, 11)).toBe(0);
    expect(recordCoinForRank(id, 0)).toBe(0);
  });

  it("전설 1등이 흔함 1등보다 크다", () => {
    expect(FISH_TIERS.legendary.recordCoins.rank1).toBeGreaterThan(
      FISH_TIERS.common.recordCoins.rank1,
    );
  });
});
