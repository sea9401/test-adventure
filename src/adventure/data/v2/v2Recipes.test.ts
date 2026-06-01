import { describe, expect, it } from "vitest";
import { V2_EQUIPMENT, isUnique, type V2EquipmentId } from "./v2Equipment";
import { FLOOR_DROP_POOLS, V2_MATERIALS } from "./dungeonDrops";
import {
  V2_RECIPES,
  consumeIngredients,
  craftShortfall,
  recipeFor,
  type V2Recipe,
} from "./v2Recipes";

const ALL_IDS = Object.keys(V2_EQUIPMENT) as V2EquipmentId[];
// 제작 대상 = 비유니크(유니크는 드랍 전용, 레시피 없음). Phase 1 은 유니크 0종이라 = ALL_IDS.
const CRAFTABLE_IDS = ALL_IDS.filter((id) => !isUnique(V2_EQUIPMENT[id]));

// 재료별 최소 드랍 층 (FLOOR_DROP_POOLS 에서 가장 얕은 층). 낮은 층은 항상 접근 가능하므로
// "재료가 층 F 까지 확보 가능" = "minFloor ≤ F".
const MIN_FLOOR: Record<string, number> = (() => {
  const m: Record<string, number> = {};
  for (const [f, rules] of Object.entries(FLOOR_DROP_POOLS)) {
    const fn = Number(f);
    for (const rule of rules) {
      if (m[rule.id] === undefined || fn < m[rule.id]) m[rule.id] = fn;
    }
  }
  return m;
})();

// 고등급(깊은 층) 게이트 재료 — T4/T5 가 최소 하나는 요구해야 함.
const DEEP_MATERIALS = new Set([
  "v2_mithril_ore",
  "v2_windweave_cloth",
  "v2_arcane_crystal",
  "v2_starlit_dust",
]);

describe("V2_RECIPES catalog", () => {
  it("정규(비유니크) 장비가 전부 레시피 보유 + result==key, 유니크는 레시피 없음", () => {
    for (const id of CRAFTABLE_IDS) {
      const r = V2_RECIPES[id];
      expect(r, id).toBeDefined();
      expect(r!.result).toBe(id);
    }
    expect(Object.keys(V2_RECIPES).length).toBe(CRAFTABLE_IDS.length);
    for (const id of ALL_IDS) {
      if (isUnique(V2_EQUIPMENT[id])) {
        expect(V2_RECIPES[id], `${id} 유니크엔 레시피 없어야`).toBeUndefined();
      }
    }
  });

  it("모든 재료 id 가 V2_MATERIALS 에 존재 (오타·고아 없음)", () => {
    for (const id of CRAFTABLE_IDS) {
      for (const ing of V2_RECIPES[id]!.ingredients) {
        expect(V2_MATERIALS[ing.id], `${id} → ${ing.id}`).toBeDefined();
      }
    }
  });

  it("재료 수량 > 0, 골드 > 0, 레시피 내 재료 id 중복 없음", () => {
    for (const id of CRAFTABLE_IDS) {
      const r = V2_RECIPES[id]!;
      expect(r.gold, id).toBeGreaterThan(0);
      expect(r.ingredients.length, id).toBeGreaterThan(0);
      const seen = new Set<string>();
      for (const ing of r.ingredients) {
        expect(ing.count, `${id} → ${ing.id}`).toBeGreaterThan(0);
        expect(seen.has(ing.id), `${id} dup ${ing.id}`).toBe(false);
        seen.add(ing.id);
      }
    }
  });

  it("티어별 골드는 단조 증가(같은 슬롯 내) — 상점가 곡선 승계", () => {
    // 같은 슬롯·컨셉의 T1<T2<...<T5 골드. 무기-힘 라인으로 표본 검증.
    const strSwords = ALL_IDS.map((id) => V2_EQUIPMENT[id])
      .filter((e) => e.slot === "weapon" && e.concept === "str")
      .sort((a, b) => a.tier - b.tier);
    for (let i = 1; i < strSwords.length; i++) {
      expect(
        V2_RECIPES[strSwords[i].id]!.gold,
        strSwords[i].id,
      ).toBeGreaterThan(V2_RECIPES[strSwords[i - 1].id]!.gold);
    }
  });

  it("티어↔층 정합 — Tn 레시피 재료는 전부 n층까지 확보 가능(드랍 깊이 ≤ 티어)", () => {
    // 5층=5티어 정렬. 어떤 재료도 그 티어가 유효한 층보다 깊게 게이트되면 안 됨
    // (rune_shard/slime_shard 류 소프트월 회귀 가드).
    for (const id of CRAFTABLE_IDS) {
      const tier = V2_EQUIPMENT[id].tier;
      for (const ing of V2_RECIPES[id]!.ingredients) {
        const minFloor = MIN_FLOOR[ing.id];
        expect(minFloor, `${ing.id} 드랍 풀 없음`).toBeDefined();
        expect(
          minFloor,
          `${id} (T${tier}) ← ${ing.id} minFloor ${minFloor}`,
        ).toBeLessThanOrEqual(tier);
      }
    }
  });

  it("T4·T5 는 깊은 층 게이트 재료를 최소 하나 요구", () => {
    for (const id of CRAFTABLE_IDS) {
      const item = V2_EQUIPMENT[id];
      if (item.tier < 4) continue;
      const hasDeep = V2_RECIPES[id]!.ingredients.some((ing) =>
        DEEP_MATERIALS.has(ing.id),
      );
      expect(hasDeep, `${id} (T${item.tier})`).toBe(true);
    }
  });

  it("계열 분기 — 검(힘)=금속, 활(민)=가죽, 지팡이(지)=마력", () => {
    // 같은 티어 T3 표본: 재료 계열이 슬롯/컨셉 따라 갈리는지.
    const t3 = (concept: string) =>
      V2_RECIPES[
        ALL_IDS.find(
          (id) =>
            V2_EQUIPMENT[id].slot === "weapon" &&
            V2_EQUIPMENT[id].concept === concept &&
            V2_EQUIPMENT[id].tier === 3,
        )!
      ]!;
    expect(t3("str").ingredients.some((i) => i.id === "v2_steel_ingot")).toBe(
      true,
    );
    expect(t3("dex").ingredients.some((i) => i.id === "v2_silk_thread")).toBe(
      true,
    );
    expect(t3("int").ingredients.some((i) => i.id === "v2_rune_shard")).toBe(
      true,
    );
  });
});

describe("craftShortfall", () => {
  const recipe = recipeFor("v2_iron_sword")!; // T1: rough_ore×2 + herb×2, gold 225
  it("재료·골드 충분하면 ok", () => {
    const r = craftShortfall(
      recipe,
      { v2_rough_ore: 5, v2_herb: 5 },
      10_000,
    );
    expect(r.ok).toBe(true);
    expect(r.missingMaterials).toEqual([]);
    expect(r.goldShort).toBe(0);
  });

  it("재료 부족 → missingMaterials 에 need/have", () => {
    const r = craftShortfall(recipe, { v2_rough_ore: 1 }, 10_000);
    expect(r.ok).toBe(false);
    const ore = r.missingMaterials.find((m) => m.id === "v2_rough_ore");
    expect(ore).toEqual({ id: "v2_rough_ore", need: 2, have: 1 });
    // herb 0 보유 → 부족 목록에 포함
    expect(r.missingMaterials.some((m) => m.id === "v2_herb")).toBe(true);
  });

  it("골드 부족 → goldShort", () => {
    const r = craftShortfall(recipe, { v2_rough_ore: 5, v2_herb: 5 }, 100);
    expect(r.ok).toBe(false);
    expect(r.goldShort).toBe(recipe.gold - 100);
  });

  it("손상 입력(materials 객체 아님)은 빈 보유로 간주", () => {
    const r = craftShortfall(recipe, null, 10_000);
    expect(r.ok).toBe(false);
    expect(r.missingMaterials.length).toBe(2);
  });

  it("같은 재료가 여러 줄이면 필요량 합산(중복 안전)", () => {
    // 합성 레시피 — herb 가 두 줄(2+3=5 필요). 보유 4 → 부족.
    const dupRecipe: V2Recipe = {
      result: "v2_iron_sword",
      ingredients: [
        { id: "v2_herb", count: 2 },
        { id: "v2_herb", count: 3 },
      ],
      gold: 0,
    };
    const r = craftShortfall(dupRecipe, { v2_herb: 4 }, 0);
    expect(r.ok).toBe(false);
    expect(r.missingMaterials).toEqual([{ id: "v2_herb", need: 5, have: 4 }]);
    // 보유 5 → 충분.
    expect(craftShortfall(dupRecipe, { v2_herb: 5 }, 0).ok).toBe(true);
  });
});

describe("consumeIngredients", () => {
  const recipe = recipeFor("v2_iron_sword")!; // rough_ore×2 + herb×2

  it("정확히 소진하면 키 제거", () => {
    expect(consumeIngredients({ v2_rough_ore: 2, v2_herb: 2 }, recipe)).toEqual(
      {},
    );
  });

  it("부분 차감 — 남은 양 유지", () => {
    expect(consumeIngredients({ v2_rough_ore: 5, v2_herb: 5 }, recipe)).toEqual({
      v2_rough_ore: 3,
      v2_herb: 3,
    });
  });

  it("레시피 무관 재료는 보존", () => {
    expect(
      consumeIngredients(
        { v2_rough_ore: 2, v2_herb: 2, v2_mithril_ore: 9 },
        recipe,
      ),
    ).toEqual({ v2_mithril_ore: 9 });
  });

  it("입력 불변(원본 맵 미변경)", () => {
    const src = { v2_rough_ore: 5, v2_herb: 5 };
    consumeIngredients(src, recipe);
    expect(src).toEqual({ v2_rough_ore: 5, v2_herb: 5 });
  });

  it("같은 id 여러 줄도 누적 차감", () => {
    const dup: V2Recipe = {
      result: "v2_iron_sword",
      ingredients: [
        { id: "v2_herb", count: 2 },
        { id: "v2_herb", count: 3 },
      ],
      gold: 0,
    };
    expect(consumeIngredients({ v2_herb: 5, v2_rough_ore: 1 }, dup)).toEqual({
      v2_rough_ore: 1,
    });
  });
});
