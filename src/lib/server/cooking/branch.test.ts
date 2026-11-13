import { describe, expect, it } from "vitest";
import { COOKING_BRANCH_RECIPE_BY_ID } from "@/adventure/v2/cooking/branchRecipes";
import {
  emptyCookingState,
  parseCookingState,
  type CookingStateV2,
} from "@/adventure/v2/cooking/state";
import {
  applyCookingBranchChoice,
  applyCookingBranchCraft,
  cookingBranchCraftContext,
  cookingBranchView,
} from "./branch";
import { COOKING_SECRET_RECIPES, COOKING_SECRET_RECIPE_BY_ID } from "./recipes";

const NOW = 1_800_000_000_000;
const DAY = 86_400_000;

function cook(overrides: Partial<CookingStateV2> = {}): CookingStateV2 {
  return {
    ...emptyCookingState(NOW),
    specialty: { field: "baking", xp: 1_500 },
    ...overrides,
  };
}

function existing(field: string, method: string, tier = 1) {
  const recipe = COOKING_SECRET_RECIPES.find(
    (entry) => entry.field === field && entry.method === method && entry.tier === tier,
  );
  if (!recipe) throw new Error(`fixture_missing:${field}:${method}:${tier}`);
  return recipe;
}

const dish = (id: string) => COOKING_SECRET_RECIPE_BY_ID.get(id)!;

describe("요리 특화 상태", () => {
  it("필드가 없으면 싣지 않고, 있으면 정리해 읽는다", () => {
    expect(parseCookingState(emptyCookingState(NOW), NOW).branch).toBeUndefined();
    const parsed = parseCookingState(
      {
        ...cook(),
        branch: { current: "baking_bread", xp: { baking_bread: 1_200.5, sushi: 3 }, changedAt: NOW },
      },
      NOW,
    );
    expect(parsed.branch).toEqual({ current: "baking_bread", xp: { baking_bread: 1_200 }, changedAt: NOW });
  });

  it("전문 분야와 맞지 않는 특화는 고르지 않은 것으로 읽는다", () => {
    const parsed = parseCookingState(
      { ...cook({ specialty: { field: "pot", xp: 9_000 } }), branch: { current: "baking_bread", xp: { baking_bread: 50 }, changedAt: null } },
      NOW,
    );
    expect(parsed.branch).toEqual({ current: null, xp: { baking_bread: 50 }, changedAt: null });
  });

  it("전용 요리 id 는 발견 목록에 남기지 않는다", () => {
    const parsed = parseCookingState(
      { ...cook(), discoveredRecipeIds: ["branch_baking_bread_1", "rustic_bread"] },
      NOW,
    );
    expect(parsed.discoveredRecipeIds).toContain("rustic_bread");
    expect(parsed.discoveredRecipeIds).not.toContain("branch_baking_bread_1");
  });
});

describe("요리 특화 서버 판정", () => {
  it("특화가 없으면 기존 요리는 그대로, 전용 요리는 잠긴다", () => {
    const state = cook();
    expect(cookingBranchCraftContext(state, existing("baking", "ferment"))).toEqual({
      allowed: true,
      covered: false,
      masterpieceBonusPct: 0,
      branchXpPerDish: 0,
    });
    expect(cookingBranchCraftContext(state, dish("branch_baking_bread_1")).allowed).toBe(false);
  });

  it("고른 특화에 속한 음식에만 보너스와 숙련이 붙는다", () => {
    const state = cook({ branch: { current: "baking_bread", xp: { baking_bread: 3_000 }, changedAt: null } });
    expect(cookingBranchCraftContext(state, existing("baking", "ferment", 2))).toEqual({
      allowed: true,
      covered: true,
      masterpieceBonusPct: 6,
      branchXpPerDish: 20,
    });
    // 같은 분야의 다른 조리법, 다른 분야의 같은 조리법은 속하지 않는다.
    for (const recipe of [existing("baking", "bake"), existing("medicinal", "ferment")]) {
      expect(cookingBranchCraftContext(state, recipe)).toEqual({
        allowed: true,
        covered: false,
        masterpieceBonusPct: 0,
        branchXpPerDish: 0,
      });
    }
  });

  it("전용 요리는 지금 고른 특화의 요구 랭크를 채워야 만든다", () => {
    const rank3 = cook({ branch: { current: "baking_bread", xp: { baking_bread: 3_000, baking_pastry: 15_000 }, changedAt: null } });
    expect(cookingBranchCraftContext(rank3, dish("branch_baking_bread_1"))).toEqual({
      allowed: true,
      covered: true,
      masterpieceBonusPct: 6,
      branchXpPerDish: 30,
    });
    expect(cookingBranchCraftContext(rank3, dish("branch_baking_bread_2")).allowed).toBe(true);
    expect(cookingBranchCraftContext(rank3, dish("branch_baking_bread_3")).allowed).toBe(false);
    // 숙련이 랭크 5여도 지금 고른 특화가 아니면 만들 수 없다.
    const other = cookingBranchCraftContext(rank3, dish("branch_baking_pastry_1"));
    expect(other).toEqual({ allowed: false, covered: false, masterpieceBonusPct: 0, branchXpPerDish: 0 });
    expect(cookingBranchCraftContext(rank3, dish("branch_hearth_grill_1")).allowed).toBe(false);
  });

  it("제작하면 속한 음식만큼 특화 숙련이 쌓인다", () => {
    const state = cook({ branch: { current: "baking_bread", xp: { baking_bread: 990 }, changedAt: null } });
    const covered = applyCookingBranchCraft(state, existing("baking", "ferment", 1), 3);
    expect(covered.branch?.xp.baking_bread).toBe(1_020);
    const exclusive = applyCookingBranchCraft(state, dish("branch_baking_bread_1"), 2);
    expect(exclusive.branch?.xp.baking_bread).toBe(1_050);
    expect(applyCookingBranchCraft(state, existing("baking", "bake"), 5)).toBe(state);
    const none = cook();
    expect(applyCookingBranchCraft(none, existing("baking", "ferment"), 5)).toBe(none);
  });

  it("선택과 변경", () => {
    const chosen = applyCookingBranchChoice(cook(), "baking_bread", NOW);
    expect(chosen.branch).toEqual({ current: "baking_bread", xp: {}, changedAt: null });
    const changed = applyCookingBranchChoice(chosen, "baking_pastry", NOW + 5);
    expect(changed.branch).toEqual({ current: "baking_pastry", xp: {}, changedAt: NOW + 5 });
    expect(() => applyCookingBranchChoice(changed, "baking_bread", NOW + DAY)).toThrow("branch_cooldown");
    expect(() => applyCookingBranchChoice(cook({ specialty: { field: "baking", xp: 1_499 } }), "baking_bread", NOW)).toThrow("branch_locked");
    expect(() => applyCookingBranchChoice(cook({ specialty: null }), "baking_bread", NOW)).toThrow("branch_locked");
    expect(() => applyCookingBranchChoice(cook(), "pot_soup", NOW)).toThrow("invalid_branch");
    expect(() => applyCookingBranchChoice(chosen, "baking_bread", NOW)).toThrow("branch_unchanged");
  });

  it("화면용 요약", () => {
    expect(cookingBranchView(cook({ specialty: { field: "baking", xp: 1_499 } }), NOW)).toEqual({
      eligible: false,
      current: null,
      rank: 0,
      xp: 0,
      nextRankXp: null,
      xpByBranch: {},
      nextChangeAt: null,
      masterpieceBonusPct: 0,
    });
    expect(cookingBranchView(cook(), NOW)).toMatchObject({ eligible: true, current: null, rank: 0 });

    const state = cook({
      branch: { current: "baking_bread", xp: { baking_bread: 3_400, baking_pastry: 20 }, changedAt: NOW - DAY },
    });
    expect(cookingBranchView(state, NOW)).toEqual({
      eligible: true,
      current: "baking_bread",
      rank: 3,
      xp: 3_400,
      nextRankXp: 7_000,
      xpByBranch: { baking_bread: 3_400, baking_pastry: 20 },
      nextChangeAt: NOW + 13 * DAY,
      masterpieceBonusPct: 6,
    });
    // 대기가 끝났으면 null.
    expect(cookingBranchView(state, NOW + 13 * DAY).nextChangeAt).toBeNull();
    const maxed = cook({ branch: { current: "baking_bread", xp: { baking_bread: 15_000 }, changedAt: null } });
    expect(cookingBranchView(maxed, NOW)).toMatchObject({ rank: 5, nextRankXp: null, masterpieceBonusPct: 10 });
  });

  it("전용 요리 42종이 모두 서버 조회 맵에 있다", () => {
    for (const id of COOKING_BRANCH_RECIPE_BY_ID.keys()) {
      expect(COOKING_SECRET_RECIPE_BY_ID.has(id)).toBe(true);
    }
  });
});
