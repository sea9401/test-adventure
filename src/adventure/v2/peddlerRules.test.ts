import { describe, expect, it } from "vitest";
import { MINING_MATERIAL_ID } from "@/adventure/data/v2/miningSpots";
import { WOODCUTTING_MATERIAL_ID } from "@/adventure/data/v2/woodcuttingSpots";
import { CUT_GEMS } from "./gemCutting";
import { LIFE_MAJOR_PRODUCT_ID } from "./lifeMajorProducts";
import { LIFE_PROCESSED_MATERIAL_ID } from "./lifeWorkshopMaterials";
import {
  PEDDLER_CARGO_ITEMS,
  PEDDLER_DISH_POINTS_BY_TIER,
  PEDDLER_MAX_RANK,
  PEDDLER_PROFESSIONS,
  PEDDLER_ROUTE_IDS,
  PEDDLER_SHOP_ITEMS,
  peddlerCapacityForRank,
  peddlerCargoItem,
  peddlerNextRankAt,
  peddlerPreferredItemIds,
  peddlerRankForPoints,
  peddlerTokenReward,
} from "./peddlerRules";

function points(id: string): number | undefined {
  return peddlerCargoItem(id)?.points;
}

describe("행상 적재 점수", () => {
  it("품목 id가 겹치지 않고 39종이다", () => {
    expect(PEDDLER_CARGO_ITEMS).toHaveLength(39);
    expect(new Set(PEDDLER_CARGO_ITEMS.map((item) => item.id)).size).toBe(39);
  });

  it("원자재는 등급이 높을수록 점수가 높다", () => {
    expect(points(`material:${WOODCUTTING_MATERIAL_ID.pine}`)).toBe(2);
    expect(points(`material:${WOODCUTTING_MATERIAL_ID.birch}`)).toBe(2);
    expect(points(`material:${WOODCUTTING_MATERIAL_ID.willow}`)).toBe(3);
    expect(points(`material:${WOODCUTTING_MATERIAL_ID.oak}`)).toBe(4);
    expect(points(`material:${WOODCUTTING_MATERIAL_ID.cedar}`)).toBe(5);
    expect(points(`material:${WOODCUTTING_MATERIAL_ID.cypress}`)).toBe(6);
    expect(points(`material:${MINING_MATERIAL_ID.iron}`)).toBe(2);
    expect(points(`material:${MINING_MATERIAL_ID.adamantite}`)).toBe(6);
    expect(points(`material:${MINING_MATERIAL_ID.stone}`)).toBe(1);
    expect(points(`material:${MINING_MATERIAL_ID.coal}`)).toBe(1);
  });

  it("가공재·작물·축산물·어획물 점수", () => {
    expect(points(`material:${LIFE_PROCESSED_MATERIAL_ID.softwood}`)).toBe(24);
    expect(points(`material:${LIFE_PROCESSED_MATERIAL_ID.preciousIngot}`)).toBe(38);
    expect(points(`material:${LIFE_PROCESSED_MATERIAL_ID.arcaneAlloy}`)).toBe(60);
    expect(points("farm:wheat")).toBe(20);
    expect(points("farm:cacao")).toBe(90);
    expect(points("farm:egg")).toBe(20);
    expect(points("farm:milk")).toBe(40);
    expect(points("farm:pork")).toBe(60);
    expect(points("fish:catch_common")).toBe(15);
    expect(points("fish:catch_legendary")).toBe(400);
  });

  it("요리는 티어로 점수를 정한다", () => {
    expect(PEDDLER_DISH_POINTS_BY_TIER).toEqual({ 1: 200, 2: 400, 3: 800, 4: 1400, 5: 1700 });
  });

  it("증표로 사는 품목과 따로 소비처가 있는 품목은 실을 수 없다", () => {
    const blocked = [
      ...Object.values(LIFE_MAJOR_PRODUCT_ID).map((id) => `material:${id}`),
      ...Object.values(CUT_GEMS).map((gem) => `material:${gem.id}`),
      `material:${MINING_MATERIAL_ID.roughGem}`,
      "farm:compound_feed",
      "farm:golden_wheat",
      "farm:golden_egg",
    ];
    for (const id of blocked) expect(peddlerCargoItem(id)).toBeNull();
    expect(peddlerCargoItem("nope")).toBeNull();
    expect(peddlerCargoItem(42)).toBeNull();
  });
});

describe("행상 단골 등급", () => {
  it("누적 점수 경계에서 등급이 오른다", () => {
    expect(peddlerRankForPoints(0)).toBe(0);
    expect(peddlerRankForPoints(5_999)).toBe(0);
    expect(peddlerRankForPoints(6_000)).toBe(1);
    expect(peddlerRankForPoints(31_999)).toBe(2);
    expect(peddlerRankForPoints(32_000)).toBe(3);
    expect(peddlerRankForPoints(599_999)).toBe(9);
    expect(peddlerRankForPoints(600_000)).toBe(10);
    expect(peddlerRankForPoints(9_999_999)).toBe(PEDDLER_MAX_RANK);
  });

  it("등급마다 적재량이 200점씩 늘어난다", () => {
    expect(peddlerCapacityForRank(0)).toBe(2_000);
    expect(peddlerCapacityForRank(3)).toBe(2_600);
    expect(peddlerCapacityForRank(10)).toBe(4_000);
  });

  it("다음 등급에 필요한 누적 점수를 돌려준다", () => {
    expect(peddlerNextRankAt(0)).toBe(6_000);
    expect(peddlerNextRankAt(9)).toBe(600_000);
    expect(peddlerNextRankAt(10)).toBeNull();
  });
});

describe("행상 증표 계산", () => {
  it("적재 2,000점에 4·8·12시간은 10·14·17개다", () => {
    expect(peddlerTokenReward({ points: 2_000, preferredPoints: 0, hours: 4, carry: 0 })).toEqual({ tokens: 10, carry: 0 });
    expect(peddlerTokenReward({ points: 2_000, preferredPoints: 0, hours: 8, carry: 0 })).toEqual({ tokens: 14, carry: 0 });
    expect(peddlerTokenReward({ points: 2_000, preferredPoints: 0, hours: 12, carry: 0 })).toEqual({ tokens: 17, carry: 0 });
  });

  it("우대 품목 점수는 1.5배로 친다", () => {
    // (2,000 + 1,000 × 50%) × 14 ÷ 2,000 = 17.5
    const first = peddlerTokenReward({ points: 2_000, preferredPoints: 1_000, hours: 8, carry: 0 });
    expect(first.tokens).toBe(17);
    expect(first.carry).toBeGreaterThan(0);
  });

  it("나머지를 이월해 여러 번 나눠 보내도 합계가 같다", () => {
    // 300점 × 10 ÷ 2,000 = 1.5개씩, 두 번이면 3개
    const first = peddlerTokenReward({ points: 300, preferredPoints: 0, hours: 4, carry: 0 });
    expect(first.tokens).toBe(1);
    const second = peddlerTokenReward({ points: 300, preferredPoints: 0, hours: 4, carry: first.carry });
    expect(second).toEqual({ tokens: 2, carry: 0 });
  });
});

describe("행상 우대 품목", () => {
  const weeks = Array.from({ length: 80 }, (_, index) =>
    new Date(Date.parse("2026-11-09T00:00:00.000Z") + index * 7 * 86_400_000).toISOString().slice(0, 10),
  );

  it("교역로마다 서로 다른 생활의 품목 2종이고 한 주 안에서 겹치지 않는다", () => {
    for (const weekId of weeks.slice(0, 12)) {
      const all: string[] = [];
      const professions = new Set<string>();
      for (const routeId of PEDDLER_ROUTE_IDS) {
        const ids = peddlerPreferredItemIds(weekId, routeId);
        expect(ids).toHaveLength(2);
        const pair = ids.map((id) => peddlerCargoItem(id)!.profession);
        expect(pair[0]).not.toBe(pair[1]);
        pair.forEach((profession) => professions.add(profession));
        all.push(...ids);
      }
      expect(new Set(all).size).toBe(6);
      expect(professions.size).toBe(PEDDLER_PROFESSIONS.length);
    }
  });

  it("같은 주는 같은 결과이고 주가 바뀌면 달라진다", () => {
    expect(peddlerPreferredItemIds("2026-11-09", "river")).toEqual(peddlerPreferredItemIds("2026-11-09", "river"));
    expect(peddlerPreferredItemIds("2026-11-09", "river")).not.toEqual(peddlerPreferredItemIds("2026-11-16", "river"));
  });

  it("오래 두면 모든 품목이 한 번은 우대 품목이 된다", () => {
    const seen = new Set<string>();
    for (const weekId of weeks) {
      for (const routeId of PEDDLER_ROUTE_IDS) {
        peddlerPreferredItemIds(weekId, routeId).forEach((id) => seen.add(id));
      }
    }
    expect(seen.size).toBe(PEDDLER_CARGO_ITEMS.length);
  });
});

describe("행상 증표 교환 품목", () => {
  it("값과 주간 한도", () => {
    const byId = Object.fromEntries(PEDDLER_SHOP_ITEMS.map((item) => [item.id, item]));
    expect(byId.master_crop).toMatchObject({ tokenCost: 30, weeklyLimit: 5 });
    expect(byId.master_wood).toMatchObject({ tokenCost: 30, weeklyLimit: 5 });
    expect(byId.master_alloy).toMatchObject({ tokenCost: 30, weeklyLimit: 5 });
    expect(byId.master_catch).toMatchObject({ tokenCost: 30, weeklyLimit: 5 });
    expect(byId.cut_gem_polished).toMatchObject({ tokenCost: 40, weeklyLimit: 5 });
    expect(byId.cut_gem_refined).toMatchObject({ tokenCost: 120, weeklyLimit: 1 });
    expect(byId.compound_feed).toMatchObject({ tokenCost: 10, weeklyLimit: null, output: { count: 10 } });
  });

  it("교환 품목은 다시 실을 수 없다", () => {
    for (const item of PEDDLER_SHOP_ITEMS) {
      const cargoId =
        item.output.kind === "material" ? `material:${item.output.itemId}` : `farm:${item.output.itemId}`;
      expect(peddlerCargoItem(cargoId)).toBeNull();
    }
  });
});
