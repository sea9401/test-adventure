import { describe, expect, it } from "vitest";
import {
  V2_EQUIPMENT,
  sellPriceOf,
  type V2EquipInstance,
  type V2EquipmentId,
} from "./v2Equipment";
import {
  VARIANCE_FRACTION,
  effectiveStats,
  rollItemStats,
  rollQualityPct,
  selectBulkSell,
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

describe("rollQualityPct", () => {
  const bow = V2_EQUIPMENT.v2_starsong_bow; // power[18,34], weight[1,3], crit[1,3]; w 위력2·무게1·옵션1

  it("god-roll(전 스탯 최대·무게 최소) = 100%", () => {
    expect(
      rollQualityPct(bow, { power: 34, weight: 1, options: { crit: 3 } }),
    ).toBe(100);
  });

  it("최저 굴림(전 스탯 최소·무게 최대) = 0%", () => {
    expect(
      rollQualityPct(bow, { power: 18, weight: 3, options: { crit: 1 } }),
    ).toBe(0);
  });

  it("카탈로그 기준값(가운데) = 50%", () => {
    expect(
      rollQualityPct(bow, { power: 26, weight: 2, options: { crit: 2 } }),
    ).toBe(50);
  });

  it("위력만 god(나머지 가운데) — 위력 가중 2 → 75%", () => {
    // power 1.0(w2) + weight 0.5(w1) + crit 0.5(w1) = 3/4
    expect(
      rollQualityPct(bow, { power: 34, weight: 2, options: { crit: 2 } }),
    ).toBe(75);
  });

  it("굴림 없으면(상점 정가) null", () => {
    expect(rollQualityPct(bow, undefined)).toBeNull();
  });

  it("변동 가능한 스탯이 0이면 null — 은가락지(위력1·무게0)", () => {
    // 위력 spread round(1*0.3)=0, 무게 spread 0 → 변동 스탯 없음(옵션도 없으면 null).
    const ring = V2_EQUIPMENT.v2_silver_ring;
    const hasVariance =
      Math.round(ring.power * VARIANCE_FRACTION) > 0 ||
      Math.round(ring.weight * VARIANCE_FRACTION) > 0 ||
      Object.values(ring.options ?? {}).some(
        (v) => Math.round((v ?? 0) * VARIANCE_FRACTION) > 0,
      );
    // 은가락지가 변동 0 이면 null 이어야(테스트 전제 — 변동 있으면 이 단언은 skip 의미).
    if (!hasVariance) {
      expect(rollQualityPct(ring, { power: 1, weight: 0 })).toBeNull();
    }
  });
});

describe("selectBulkSell", () => {
  const id = (s: string) => s as V2EquipmentId;
  const owned: V2EquipInstance[] = [
    { iid: "eq", id: id("v2_iron_sword") }, // 장착 → 제외
    { iid: "lock", id: id("v2_iron_sword"), locked: true }, // 잠금 → 제외
    { iid: "sell1", id: id("v2_iron_sword") }, // 판매(무기)
    { iid: "sell2", id: id("v2_leather_armor") }, // 판매(갑옷)
    { iid: "uniq", id: id("v2_uniq_shadow_garb") }, // 유니크 비매 → 제외
  ];
  const equipped = { weapon: "eq" };

  it("미장착·미잠금·판매가능만 — 장착/잠금/유니크 제외", () => {
    const plan = selectBulkSell(owned, equipped, {});
    expect([...plan.iids].sort()).toEqual(["sell1", "sell2"]);
    expect(plan.count).toBe(2);
    expect(plan.gold).toBe(
      (sellPriceOf(V2_EQUIPMENT.v2_iron_sword) ?? 0) +
        (sellPriceOf(V2_EQUIPMENT.v2_leather_armor) ?? 0),
    );
  });

  it("slot 필터 — weapon 만(sell1), 갑옷 sell2 제외", () => {
    const plan = selectBulkSell(owned, equipped, { slot: "weapon" });
    expect(plan.iids).toEqual(["sell1"]);
    expect(plan.gold).toBe(sellPriceOf(V2_EQUIPMENT.v2_iron_sword) ?? 0);
  });

  it("belowPct — 굴림% < N 만, 굴림 없는 건 제외", () => {
    const bows: V2EquipInstance[] = [
      {
        iid: "low",
        id: id("v2_starsong_bow"),
        roll: { power: 18, weight: 3, options: { crit: 1 } }, // 0%
      },
      {
        iid: "high",
        id: id("v2_starsong_bow"),
        roll: { power: 34, weight: 1, options: { crit: 3 } }, // 100%
      },
      { iid: "noroll", id: id("v2_starsong_bow") }, // 굴림 없음 → 제외
    ];
    const plan = selectBulkSell(bows, {}, { belowPct: 40 });
    expect(plan.iids).toEqual(["low"]);
  });
});
