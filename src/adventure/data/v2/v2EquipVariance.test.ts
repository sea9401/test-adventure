import { describe, expect, it, vi } from "vitest";
import {
  V2_EQUIPMENT,
  isUnique,
  sellPriceOf,
  type V2EquipInstance,
  type V2EquipmentId,
} from "./v2Equipment";
import {
  COMBINE_GOLD_COST,
  REFORGE_GOLD_K,
  REFORGE_HIGH_ROLLS,
  REFORGE_MIN_COST,
  REFORGE_STONE_DROP_PCT,
  REFORGE_UNIQUE_COST_MULT,
  V2_REFORGE_ENABLED,
  VARIANCE_FRACTION,
  canReforge,
  equipRollFromPercentiles,
  equipRollPercentiles,
  effectiveStats,
  reforgeGoldCost,
  reforgeRollCount,
  rollItemStats,
  rollItemStatsBest,
  rollQualityPct,
  rollReforgeStoneDrops,
  selectBulkSell,
  selectExplicitSell,
} from "./v2EquipVariance";

describe("조합소 공통 비용", () => {
  it("조합 종류와 관계없이 300,000G를 사용한다", () => {
    expect(COMBINE_GOLD_COST).toBe(300_000);
  });
});

describe("rollItemStats", () => {
  it("사냥 최소 품질은 각 굴림 구간의 하단을 지정 품질 이상으로 remap한다", () => {
    const item = V2_EQUIPMENT.v2_starsong_bow;
    const unrestricted = rollItemStats(item, () => 0);
    const limited = rollItemStats(item, () => 0, { minimumQualityPct: 10 });

    expect(rollQualityPct(item, unrestricted)).toBe(0);
    expect(rollQualityPct(item, limited)).toBeGreaterThanOrEqual(10);
  });
  it("rng=0 → 각 스탯 최소값(별노래궁: 위력 ±편차, crit ±1, 속도 페널티 고정)", () => {
    // power spread = round(위력×0.65) → [위력−spread, 위력+spread]. crit 1→[1,3].
    // 위력값은 카탈로그 기준(다이얼 변경에 견고).
    const bowPow = V2_EQUIPMENT.v2_starsong_bow.power;
    const spread = Math.round(bowPow * VARIANCE_FRACTION);
    const r = rollItemStats(V2_EQUIPMENT.v2_starsong_bow, () => 0);
    expect(r).toEqual({
      power: bowPow - spread,
      weight: 0,
      options: { crit: 1, spd: -4 },
    });
  });

  it("rng≈1 → 각 스탯 최대값", () => {
    const bowPow = V2_EQUIPMENT.v2_starsong_bow.power;
    const spread = Math.round(bowPow * VARIANCE_FRACTION);
    const r = rollItemStats(V2_EQUIPMENT.v2_starsong_bow, () => 0.999);
    expect(r).toEqual({
      power: bowPow + spread,
      weight: 0,
      options: { crit: 3, spd: -4 },
    });
  });

  it("값 0(무게)은 spread 0 → 변동 없음, 위력은 ±편차(0.65)", () => {
    // 은가락지 위력 4: spread round(4*0.65)=3 → [1,7]. 무게 0 → spread 0 고정.
    const lo = rollItemStats(V2_EQUIPMENT.v2_silver_ring, () => 0);
    expect(lo.weight).toBe(0); // 무게 0 고정
    expect(lo.power).toBe(1); // 위력 [1,7] 의 하단
    const hi = rollItemStats(V2_EQUIPMENT.v2_silver_ring, () => 0.999);
    expect(hi.weight).toBe(0); // 무게 0 고정
    expect(hi.power).toBe(7); // 위력 [1,7] 의 상단
  });

  it("옵션 없는 아이템은 굴림에 options 없음 — 목궁", () => {
    const r = rollItemStats(V2_EQUIPMENT.v2_wooden_bow, () => 0);
    expect(r.options).toBeUndefined();
    expect(r.power).toBe(2); // power 5: spread round(5*0.65)=3 → [2,8]
    expect(r.weight).toBe(0);
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
            if (v < 0) {
              expect(rv, `${item.id}.${k}`).toBe(v);
              continue;
            }
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

describe("equipment roll percentile conversion", () => {
  it("round-trips variable and fixed stats without adding option keys", () => {
    const item = V2_EQUIPMENT.v2_storm_gale_bow;
    const values = [0.1, 0.9, 0.4, 0.7, 0.2];
    let index = 0;
    const roll = rollItemStats(item, () => values[index++] ?? 0.5);

    expect(equipRollFromPercentiles(item, equipRollPercentiles(item, roll))).toEqual(
      roll,
    );
    expect(Object.keys(roll.options ?? {}).sort()).toEqual(
      Object.keys(item.options ?? {}).sort(),
    );
  });

  it("preserves fixed negative options and tier-16 scale metadata", () => {
    const item = V2_EQUIPMENT.v2_storm_wreckage_greatsword;
    const roll = rollItemStats(item, () => 0.75);

    expect(equipRollFromPercentiles(item, equipRollPercentiles(item, roll))).toEqual(
      roll,
    );
    expect(roll.options?.spd).toBe(-6);
    expect(roll.powerScaleVersion).toBeDefined();
  });
});

describe("effectiveStats", () => {
  const bow = V2_EQUIPMENT.v2_starsong_bow; // 위력=카탈로그 기준, crit2, 속도-4

  it("굴림 없으면 카탈로그 그대로(무게는 0)", () => {
    expect(effectiveStats(bow, undefined)).toEqual({
      power: bow.power,
      weight: 0,
      options: { crit: 2, spd: -4 },
    });
  });

  it("굴림 있으면 그 값", () => {
    expect(
      effectiveStats(bow, { power: 16, weight: 1, options: { crit: 3 } }),
    ).toEqual({ power: 16, weight: 0, options: { crit: 3, spd: -4 } });
  });

  it("굴림에 options 없으면 카탈로그 옵션으로 폴백", () => {
    expect(effectiveStats(bow, { power: 16, weight: 1 })).toEqual({
      power: 16,
      weight: 0,
      options: { crit: 2, spd: -4 },
    });
  });

  it("카탈로그에 없는 옵션은 주입 안 함(스코프) — 활은 crit만, mp 무시", () => {
    expect(
      effectiveStats(bow, { power: 16, weight: 1, options: { crit: 3, mp: 99 } }),
    ).toEqual({ power: 16, weight: 0, options: { crit: 3, spd: -4 } });
  });

  it("2옵션 아이템: 굴림 일부 키만이면 나머지는 카탈로그 — 회피망토 eva굴림+hp카탈로그", () => {
    // lake_dodge_cloak 카탈로그 옵션 {eva:10, hp:40}. 굴림이 eva만 담음 → hp 는 카탈로그 유지.
    const cloak = V2_EQUIPMENT.v2_lake_dodge_cloak;
    expect(
      effectiveStats(cloak, { power: 12, weight: 1, options: { eva: 25 } }),
    ).toEqual({ power: 12, weight: 0, options: { eva: 25, hp: 40 } });
  });

  it("옵션 없는 아이템은 굴림에 옵션이 있어도 주입 안 함 — 목궁", () => {
    const r = effectiveStats(V2_EQUIPMENT.v2_wooden_bow, {
      power: 4,
      weight: 1,
      options: { crit: 5 },
    });
    expect(r.power).toBe(4);
    expect(r.weight).toBe(0);
    expect(r.options).toBeUndefined();
  });
});

describe("rollQualityPct", () => {
  const bow = V2_EQUIPMENT.v2_starsong_bow;
  // 위력 범위 [base−spread, base+spread] — 카탈로그 기준(다이얼 변경에 견고). crit[1,3].
  const pBase = bow.power;
  const pSpread = Math.round(pBase * VARIANCE_FRACTION);
  const pMin = pBase - pSpread;
  const pMax = pBase + pSpread;

  it("god-roll(전 스탯 최대·무게 최소) = 100%", () => {
    expect(
      rollQualityPct(bow, { power: pMax, weight: 1, options: { crit: 3 } }),
    ).toBe(100);
  });

  it("최저 굴림(전 스탯 최소·무게 최대) = 0%", () => {
    expect(
      rollQualityPct(bow, { power: pMin, weight: 3, options: { crit: 1 } }),
    ).toBe(0);
  });

  it("카탈로그 기준값(가운데) = 50%", () => {
    // base = (min+max)/2 가운데, weight 2·crit 2 도 가운데.
    expect(
      rollQualityPct(bow, { power: pBase, weight: 2, options: { crit: 2 } }),
    ).toBe(50);
  });

  it("위력만 god(나머지 가운데) — 실제 전투 기여 폭 기준 99%", () => {
    // 별노래궁은 공격력 굴림 폭이 치명타 2%p 폭보다 훨씬 커 위력이 품질을 지배한다.
    expect(
      rollQualityPct(bow, { power: pMax, weight: 2, options: { crit: 2 } }),
    ).toBe(99);
  });

  it("굴림 없으면(상점 정가) null", () => {
    expect(rollQualityPct(bow, undefined)).toBeNull();
  });

  it("0.65 에선 저값 아이템도 변동 생김 — 은가락지(위력1=±1)는 굴림% 반환", () => {
    // 0.3 때는 위력1 spread 0 이라 null 이었으나, 0.65 면 spread 1(변동) → 점수화됨.
    const ring = V2_EQUIPMENT.v2_silver_ring;
    expect(Math.round(ring.power * VARIANCE_FRACTION)).toBeGreaterThan(0);
    expect(rollQualityPct(ring, { power: 1, weight: 0 })).not.toBeNull();
  });

  it("낮은 주 능력치를 값싼 다옵션 개수만으로 고품질로 만들지 않는다", () => {
    const item = {
      ...bow,
      power: 100,
      options: { hp: 100, mp: 100, crit: 10, critMult: 20 },
    };

    // 위력 [35,165]은 최저, 모든 옵션은 최대다. 전투 기여 폭은
    // 위력 130, HP 13, MP 13, 치명 7, 치명피해 3.25라 36.25 / 166.25 = 22%.
    expect(
      rollQualityPct(item, {
        power: 35,
        weight: 0,
        options: { hp: 165, mp: 165, crit: 17, critMult: 33 },
      }),
    ).toBe(22);
  });

  it("같은 굴림 폭이면 HP보다 방어력의 전투 기여를 크게 반영한다", () => {
    const item = {
      ...bow,
      power: 100,
      options: { hp: 10, def: 10 },
    };
    const hpHigh = rollQualityPct(item, {
      power: 35,
      weight: 0,
      options: { hp: 17, def: 3 },
    });
    const defHigh = rollQualityPct(item, {
      power: 35,
      weight: 0,
      options: { hp: 3, def: 17 },
    });

    expect(hpHigh).toBe(1);
    expect(defHigh).toBe(10);
  });
});

describe("reforgeGoldCost", () => {
  it("비용 = max(MIN, 위력×K) × 유니크배수 (전 표본 일치)", () => {
    for (const item of Object.values(V2_EQUIPMENT)) {
      const base = Math.max(
        REFORGE_MIN_COST,
        Math.floor(item.power * REFORGE_GOLD_K),
      );
      const mult = isUnique(item) ? REFORGE_UNIQUE_COST_MULT : 1;
      expect(reforgeGoldCost(item), item.id).toBe(base * mult);
    }
  });

  it("고위력 무기는 바닥 위(위력×K) — 별노래궁", () => {
    const bow = V2_EQUIPMENT.v2_starsong_bow;
    expect(isUnique(bow)).toBe(false);
    expect(reforgeGoldCost(bow)).toBe(bow.power * REFORGE_GOLD_K);
    expect(reforgeGoldCost(bow)).toBeGreaterThan(REFORGE_MIN_COST);
  });

  it("저위력 아이템은 바닥(MIN) 적용 — 은가락지", () => {
    const ring = V2_EQUIPMENT.v2_silver_ring; // 위력 2 → 2,000 < 20,000
    expect(Math.floor(ring.power * REFORGE_GOLD_K)).toBeLessThan(
      REFORGE_MIN_COST,
    );
    const mult = isUnique(ring) ? REFORGE_UNIQUE_COST_MULT : 1;
    expect(reforgeGoldCost(ring)).toBe(REFORGE_MIN_COST * mult);
  });

  it("유니크는 ×2 — 잊힌 사제의 성갑(고유 아이템)", () => {
    const uniq = V2_EQUIPMENT.v2_sanctum_sig_priest_armor;
    expect(isUnique(uniq)).toBe(true);
    const base = Math.max(
      REFORGE_MIN_COST,
      Math.floor(uniq.power * REFORGE_GOLD_K),
    );
    expect(reforgeGoldCost(uniq)).toBe(base * 2);
  });
});

describe("canReforge", () => {
  const bow = V2_EQUIPMENT.v2_starsong_bow;

  it("재련 비활성 중에는 굴림·제작 장비도 모두 false", () => {
    expect(V2_REFORGE_ENABLED).toBe(false);
    expect(
      canReforge(bow, { power: bow.power, weight: 2, options: { crit: 2 } }),
    ).toBe(false);
    expect(canReforge(bow, undefined)).toBe(false);
    const crafted = V2_EQUIPMENT.v2_crafted_aurora_crown;
    expect(canReforge(crafted, undefined)).toBe(false);
    expect(
      canReforge(bow, undefined, {
        craftedBy: {
          userId: "u1",
          profession: "blacksmith",
          level: 9,
          craftedAt: "2026-06-30T00:00:00.000Z",
        },
      }),
    ).toBe(false);
  });
});

describe("selectBulkSell", () => {
  const id = (s: string) => s as V2EquipmentId;
  const owned: V2EquipInstance[] = [
    { iid: "eq", id: id("v2_iron_sword") }, // 장착 → 제외
    { iid: "lock", id: id("v2_iron_sword"), locked: true }, // 잠금 → 제외
    { iid: "bound", id: id("v2_iron_sword"), bound: true }, // 귀속 → 자동 판매 제외
    { iid: "sell1", id: id("v2_iron_sword") }, // 판매(무기)
    { iid: "sell2", id: id("v2_leather_armor") }, // 판매(갑옷)
    { iid: "uniq", id: id("v2_lake_dodge_cloak") }, // 유니크도 이제 판매 가능(잠금으로만 보호)
  ];
  const equipped = { weapon: "eq" };

  it("미장착·미잠금만 — 장착/잠금만 제외 (유니크·수련용·제작 모두 판매 가능)", () => {
    const plan = selectBulkSell(owned, equipped, {});
    expect([...plan.iids].sort()).toEqual(["sell1", "sell2", "uniq"]);
    expect(plan.count).toBe(3);
    expect(plan.skippedBoundCount).toBe(1);
    expect(plan.gold).toBe(
      (sellPriceOf(V2_EQUIPMENT.v2_iron_sword) ?? 0) +
        (sellPriceOf(V2_EQUIPMENT.v2_leather_armor) ?? 0) +
        (sellPriceOf(V2_EQUIPMENT.v2_lake_dodge_cloak) ?? 0),
    );
  });

  it("slot 필터 — weapon 만(sell1), 갑옷 sell2 제외", () => {
    const plan = selectBulkSell(owned, equipped, { slot: "weapon" });
    expect(plan.iids).toEqual(["sell1"]);
    expect(plan.skippedBoundCount).toBe(1);
    expect(plan.gold).toBe(sellPriceOf(V2_EQUIPMENT.v2_iron_sword) ?? 0);
  });

  it("belowPct — 품질% ≤ N 만(이하), 굴림 없는 건 제외", () => {
    const bows: V2EquipInstance[] = [
      {
        iid: "low",
        id: id("v2_starsong_bow"),
        roll: { power: 27, weight: 3, options: { crit: 1 } }, // 0%
      },
      {
        iid: "high",
        id: id("v2_starsong_bow"),
        roll: { power: 129, weight: 1, options: { crit: 3 } }, // 100%
      },
      { iid: "noroll", id: id("v2_starsong_bow") }, // 굴림 없음 → 제외
    ];
    const plan = selectBulkSell(bows, {}, { belowPct: 40 });
    expect(plan.iids).toEqual(["low"]);
    // 경계 포함(이하) — belowPct=100 이면 100% 품질도 포함(미만이면 제외됐을 것).
    const all = selectBulkSell(bows, {}, { belowPct: 100 });
    expect(all.iids).toEqual(["low", "high"]);
  });
});

describe("selectExplicitSell", () => {
  const id = (value: string) => value as V2EquipmentId;
  const owned: V2EquipInstance[] = [
    { iid: "equipped", id: id("v2_iron_sword") },
    { iid: "locked", id: id("v2_iron_sword"), locked: true },
    { iid: "first", id: id("v2_iron_sword") },
    { iid: "second", id: id("v2_leather_armor") },
    { iid: "bound", id: id("v2_iron_sword"), bound: true },
  ];

  it("요청한 판매 가능 개체만 입력 순서대로 계획한다", () => {
    const result = selectExplicitSell(owned, { weapon: "equipped" }, [
      "second",
      "first",
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.iids).toEqual(["second", "first"]);
    expect(result.plan.count).toBe(2);
    expect(result.plan.gold).toBeGreaterThan(0);
  });

  it("명시적으로 고른 귀속 장비는 서버 확인 절차를 위해 계획에 포함한다", () => {
    const result = selectExplicitSell(owned, {}, ["bound"]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.iids).toEqual(["bound"]);
  });

  it.each([
    ["보유 목록에서 사라진 경우", ["first", "missing"]],
    ["판매 직전에 장착된 경우", ["first", "equipped"]],
    ["잠긴 경우", ["first", "locked"]],
    ["같은 iid가 중복된 경우", ["first", "first"]],
  ])("%s 부분 판매 없이 전체 계획을 거절한다", (_label, iids) => {
    expect(
      selectExplicitSell(owned, { weapon: "equipped" }, iids),
    ).toEqual({ ok: false, reason: "selection_changed" });
  });
});

describe("rollReforgeStoneDrops", () => {
  it("드랍 다이얼은 보존하되 비활성 중에는 RNG 소모 없이 빈 결과", () => {
    expect(V2_REFORGE_ENABLED).toBe(false);
    expect(REFORGE_STONE_DROP_PCT.basic).toBe(0.15);
    expect(REFORGE_STONE_DROP_PCT.high).toBe(0.04);
    const rng = vi.fn(() => 0);
    expect(rollReforgeStoneDrops(rng, 5)).toEqual({});
    expect(rng).not.toHaveBeenCalled();
  });
});

describe("reforgeRollCount / rollItemStatsBest (max-of-N)", () => {
  // 동일 시퀀스를 반복 생성(rollItemStatsBest 내부 굴림을 그대로 재현해 비교).
  const mkSeq = () => {
    const v = [
      0.1, 0.9, 0.2, 0.8, 0.95, 0.05, 0.99, 0.5, 0.3, 0.7, 0.6, 0.4, 0.85,
      0.15, 0.45,
    ];
    let i = 0;
    return () => v[i++ % v.length];
  };

  it("reforgeRollCount — 일반=1·상급=REFORGE_HIGH_ROLLS(3)", () => {
    expect(reforgeRollCount("basic")).toBe(1);
    expect(reforgeRollCount("high")).toBe(REFORGE_HIGH_ROLLS);
    expect(REFORGE_HIGH_ROLLS).toBeGreaterThan(1);
  });

  it("count=1 이면 rollItemStats 와 동일(일반 재련=현 굴림)", () => {
    const item = V2_EQUIPMENT.v2_starsong_bow;
    expect(rollItemStatsBest(item, mkSeq(), 1)).toEqual(
      rollItemStats(item, mkSeq()),
    );
  });

  it("count회 굴림 중 품질 최고를 채택(동률이면 첫 굴림)", () => {
    const item = V2_EQUIPMENT.v2_starsong_bow;
    const best = rollItemStatsBest(item, mkSeq(), 3);
    // 같은 시퀀스로 3개 굴림을 그대로 재현 → 그중 최고 품질과 일치해야.
    const r = mkSeq();
    const rolls = [
      rollItemStats(item, r),
      rollItemStats(item, r),
      rollItemStats(item, r),
    ];
    const quals = rolls.map((x) => rollQualityPct(item, x) ?? -1);
    const maxQ = Math.max(...quals);
    expect(rollQualityPct(item, best)).toBe(maxQ);
    expect(best).toEqual(rolls[quals.indexOf(maxQ)]); // 동률 시 첫 번째
  });
});
