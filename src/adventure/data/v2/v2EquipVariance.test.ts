import { describe, expect, it } from "vitest";
import { V2_EQUIPMENT } from "./v2Equipment";
import {
  VARIANCE_FRACTION,
  effectiveStats,
  rollItemStats,
} from "./v2EquipVariance";

describe("rollItemStats", () => {
  it("rng=0 → 각 스탯 최소값(별노래궁 power26/weight2/crit2)", () => {
    // power spread round(26*0.3)=8 → [18,34]; weight spread 1 → [1,3]; crit spread 1 → [1,3].
    const r = rollItemStats(V2_EQUIPMENT.v2_starsong_bow, () => 0);
    expect(r).toEqual({ power: 18, weight: 1, options: { crit: 1 } });
  });

  it("rng≈1 → 각 스탯 최대값", () => {
    const r = rollItemStats(V2_EQUIPMENT.v2_starsong_bow, () => 0.999);
    expect(r).toEqual({ power: 34, weight: 3, options: { crit: 3 } });
  });

  it("작은 위력/무게(spread 0)는 변동 없음 — 은가락지 power1/weight0", () => {
    // critMult 옵션은 별도 굴림 — 여기선 위력/무게가 안 변하는 것만 검증.
    const lo = rollItemStats(V2_EQUIPMENT.v2_silver_ring, () => 0);
    expect(lo.power).toBe(1);
    expect(lo.weight).toBe(0);
    const hi = rollItemStats(V2_EQUIPMENT.v2_silver_ring, () => 0.999);
    expect(hi.power).toBe(1);
    expect(hi.weight).toBe(0);
  });

  it("옵션 없는 아이템은 굴림에 options 없음 — 철검 power3/weight2", () => {
    const r = rollItemStats(V2_EQUIPMENT.v2_iron_sword, () => 0);
    expect(r.options).toBeUndefined();
    expect(r.power).toBe(2); // spread 1 → [2,4]
    expect(r.weight).toBe(1); // spread 1 → [1,3]
  });

  it("전 아이템: 굴림이 항상 바닥·범위 안 (LCG 다수 시행)", () => {
    let seed = 12345;
    const rng = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (const item of Object.values(V2_EQUIPMENT)) {
      for (let i = 0; i < 30; i++) {
        const r = rollItemStats(item, rng);
        const ps = Math.round(item.power * VARIANCE_FRACTION);
        const ws = Math.round(item.weight * VARIANCE_FRACTION);
        expect(r.power, `${item.id}.power`).toBeGreaterThanOrEqual(1);
        expect(Math.abs(r.power - item.power), `${item.id}.power spread`).toBeLessThanOrEqual(ps);
        expect(r.weight, `${item.id}.weight`).toBeGreaterThanOrEqual(0);
        expect(Math.abs(r.weight - item.weight), `${item.id}.weight spread`).toBeLessThanOrEqual(ws);
        if (item.options) {
          for (const [k, v] of Object.entries(item.options)) {
            const rv = (r.options ?? {})[k as keyof typeof r.options];
            expect(rv, `${item.id}.${k}`).toBeGreaterThanOrEqual(1);
            expect(
              Math.abs((rv ?? 0) - v),
              `${item.id}.${k} spread`,
            ).toBeLessThanOrEqual(Math.round(v * VARIANCE_FRACTION));
          }
        }
      }
    }
  });
});

describe("effectiveStats", () => {
  const bow = V2_EQUIPMENT.v2_starsong_bow; // power26, weight2, crit2

  it("굴림 없으면 카탈로그 그대로", () => {
    expect(effectiveStats(bow, undefined)).toEqual({
      power: 26,
      weight: 2,
      options: { crit: 2 },
    });
  });

  it("굴림 있으면 그 값", () => {
    expect(
      effectiveStats(bow, { power: 16, weight: 1, options: { crit: 3 } }),
    ).toEqual({ power: 16, weight: 1, options: { crit: 3 } });
  });

  it("굴림에 options 없으면 카탈로그 옵션으로 폴백", () => {
    expect(effectiveStats(bow, { power: 16, weight: 1 })).toEqual({
      power: 16,
      weight: 1,
      options: { crit: 2 },
    });
  });

  it("카탈로그에 없는 옵션은 주입 안 함(스코프) — 활은 crit만, mp 무시", () => {
    expect(
      effectiveStats(bow, { power: 16, weight: 1, options: { crit: 3, mp: 99 } }),
    ).toEqual({ power: 16, weight: 1, options: { crit: 3 } });
  });

  it("2옵션 아이템: 굴림 일부 키만이면 나머지는 카탈로그 — 잠행복 eva굴림+crit카탈로그", () => {
    // shadow_garb 카탈로그 옵션 {eva:2, crit:2}. 굴림이 eva만 담음 → crit 은 카탈로그 유지.
    const garb = V2_EQUIPMENT.v2_uniq_shadow_garb;
    expect(
      effectiveStats(garb, { power: 1, weight: 2, options: { eva: 3 } }),
    ).toEqual({ power: 1, weight: 2, options: { eva: 3, crit: 2 } });
  });

  it("옵션 없는 아이템은 굴림에 옵션이 있어도 주입 안 함 — 철검", () => {
    const r = effectiveStats(V2_EQUIPMENT.v2_iron_sword, {
      power: 4,
      weight: 1,
      options: { crit: 5 },
    });
    expect(r.power).toBe(4);
    expect(r.weight).toBe(1);
    expect(r.options).toBeUndefined();
  });
});
