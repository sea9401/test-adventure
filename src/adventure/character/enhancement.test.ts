import { describe, expect, it } from "vitest";
import {
  ENHANCE_FULL_COST,
  ENHANCE_MAX_LEVEL,
  ENHANCE_SHARD_COST,
  enhancementBonus,
  isEnhanceable,
  nextEnhanceCost,
  planEnhance,
  resolveEnhancedItem,
} from "./enhancement";

describe("enhancement — 비용 상수", () => {
  it("ENHANCE_SHARD_COST 의 합이 ENHANCE_FULL_COST 와 같다", () => {
    const sum = ENHANCE_SHARD_COST.reduce((a, b) => a + b, 0);
    expect(sum).toBe(ENHANCE_FULL_COST);
    expect(ENHANCE_FULL_COST).toBe(1690); // 30+60+100+150+250+400+700
  });

  it("ENHANCE_MAX_LEVEL 까지 모든 단계에 비용 entry 가 있다 (0 단계는 0)", () => {
    expect(ENHANCE_SHARD_COST.length).toBe(ENHANCE_MAX_LEVEL + 1);
    expect(ENHANCE_SHARD_COST[0]).toBe(0);
  });
});

describe("enhancement — isEnhaceable", () => {
  it("별빛 무구 30종 (무기 25 + 갑옷 5) 만 강화 가능", () => {
    for (const id of [
      "starlit_greatsword_str",
      "starlit_lance_dex",
      "starlit_shield_vit",
      "starlit_twinblades_spd",
      "starlit_dagger_luk",
      "starlit_armor_str",
      "starlit_armor_dex",
      "starlit_armor_vit",
      "starlit_armor_spd",
      "starlit_armor_luk",
    ] as const) {
      expect(isEnhanceable(id)).toBe(true);
    }
  });

  it("empyrean 이하 는 강화 불가", () => {
    for (const id of [
      "empyrean_blade",
      "star_blade",
      "peak_sword",
      "baseball_bat",
    ] as const) {
      expect(isEnhanceable(id)).toBe(false);
    }
  });
});

describe("enhancement — enhancementBonus", () => {
  it("0 단계는 빈 보너스", () => {
    expect(enhancementBonus("starlit_greatsword_str", 0)).toEqual({});
  });

  it("무기: 단계당 atk +1 + 메인스탯 +1 (모든 부스탯 변형 동일)", () => {
    expect(enhancementBonus("starlit_greatsword_str", 3)).toEqual({ atk: 3, str: 3 });
    expect(enhancementBonus("starlit_greatsword_luk", 3)).toEqual({ atk: 3, str: 3 });
    expect(enhancementBonus("starlit_shield_vit", 5)).toEqual({ atk: 5, vit: 5 });
    expect(enhancementBonus("starlit_lance_dex", 2)).toEqual({ atk: 2, dex: 2 });
    expect(enhancementBonus("starlit_dagger_luk", 4)).toEqual({ atk: 4, luk: 4 });
    expect(enhancementBonus("starlit_twinblades_spd", 7)).toEqual({ atk: 7, spd: 7 });
  });

  it("갑옷: 단계당 def +1 + 메인스탯 +1", () => {
    expect(enhancementBonus("starlit_armor_str", 3)).toEqual({ def: 3, str: 3 });
    expect(enhancementBonus("starlit_armor_dex", 5)).toEqual({ def: 5, dex: 5 });
    expect(enhancementBonus("starlit_armor_vit", 7)).toEqual({ def: 7, vit: 7 });
  });

  it("강화 불가 itemId 는 빈 보너스", () => {
    expect(enhancementBonus("empyrean_blade", 3)).toEqual({});
  });
});

describe("enhancement — nextEnhanceCost", () => {
  it("1단계 30, 2: 60, 3: 100, 4: 150, 5: 250, 6: 400, 7: 700", () => {
    expect(nextEnhanceCost(0)).toEqual({ toLevel: 1, shards: 30 });
    expect(nextEnhanceCost(1)).toEqual({ toLevel: 2, shards: 60 });
    expect(nextEnhanceCost(2)).toEqual({ toLevel: 3, shards: 100 });
    expect(nextEnhanceCost(3)).toEqual({ toLevel: 4, shards: 150 });
    expect(nextEnhanceCost(4)).toEqual({ toLevel: 5, shards: 250 });
    expect(nextEnhanceCost(5)).toEqual({ toLevel: 6, shards: 400 });
    expect(nextEnhanceCost(6)).toEqual({ toLevel: 7, shards: 700 });
  });

  it("최대 단계 도달 시 null", () => {
    expect(nextEnhanceCost(7)).toBeNull();
    expect(nextEnhanceCost(99)).toBeNull();
  });

  it("음수/비정수 입력 → null", () => {
    expect(nextEnhanceCost(-1)).toBeNull();
    expect(nextEnhanceCost(1.5)).toBeNull();
  });
});

describe("enhancement — planEnhance", () => {
  it("정상 경로 — 별빛 조각 충분", () => {
    expect(planEnhance("starlit_greatsword_str", 0, 30)).toEqual({
      ok: true,
      toLevel: 1,
      shards: 30,
    });
    expect(planEnhance("starlit_greatsword_str", 6, 700)).toEqual({
      ok: true,
      toLevel: 7,
      shards: 700,
    });
  });

  it("강화 불가 itemId", () => {
    const r = planEnhance("empyrean_blade", 0, 1000);
    expect(r).toEqual({ ok: false, reason: "not_enhanceable" });
  });

  it("최대 단계 (+7) 도달 후 → max_level", () => {
    const r = planEnhance("starlit_greatsword_str", 7, 1000);
    expect(r).toEqual({ ok: false, reason: "max_level" });
  });

  it("별빛 조각 부족", () => {
    const r = planEnhance("starlit_greatsword_str", 0, 29);
    expect(r).toEqual({ ok: false, reason: "insufficient_shards" });
  });

  it("잘못된 단계 (음수)", () => {
    const r = planEnhance("starlit_greatsword_str", -1, 1000);
    expect(r).toEqual({ ok: false, reason: "invalid_level" });
  });
});

describe("enhancement — resolveEnhancedItem", () => {
  it("강화 0 단계: 베이스 그대로 + 메타만 박힘", () => {
    const item = resolveEnhancedItem("starlit_greatsword_str", undefined, 0, "id-x");
    expect(item.bonus).toEqual({ atk: 28, str: 19 });
    expect(item.enhancementLevel).toBe(0);
    expect(item.instanceId).toBe("id-x");
  });

  it("강화 +3: 무기 bonus 에 atk +3 / 메인스탯 +3 누적", () => {
    const item = resolveEnhancedItem("starlit_greatsword_str", undefined, 3, "id-y");
    expect(item.bonus).toEqual({ atk: 31, str: 22 });
    expect(item.enhancementLevel).toBe(3);
  });

  it("강화 +7: 풀강 갑옷 bonus 에 def +7 / 메인스탯 +7 누적", () => {
    const item = resolveEnhancedItem("starlit_armor_dex", undefined, 7, "id-z");
    expect(item.bonus).toEqual({ def: 31, dex: 21 });
  });
});
