import { describe, expect, it } from "vitest";

import {
  BASIC_COOKING_RECIPE_IDS,
  COOKING_PUBLIC_RECIPES,
} from "./catalog";
import { COOKING_CODEX_MILESTONES } from "./catalogMeta";
import { COOKING_SPECIALTY_CHANGE_COOLDOWN_MS } from "./specialty";
import {
  chooseCookingSpecialty,
  cookingLevelXpThreshold,
  cookingSpecialtyNextChangeAt,
  cookingSpecialtyRank,
  emptyCookingState,
  parseCookingState,
} from "./state";

const NOW = new Date("2026-08-22T01:00:00.000Z").getTime();
const TEN_HIDDEN_IDS = COOKING_PUBLIC_RECIPES.filter(
  (entry) => entry.discovery === "hidden",
)
  .slice(0, 10)
  .map((entry) => entry.id);

describe("cooking v2 state", () => {
  it("offers discovery milestones through the five-hundred-recipe catalog", () => {
    expect(COOKING_CODEX_MILESTONES.map((milestone) => milestone.goal)).toEqual([
      10, 25, 50, 75, 100, 150, 200, 300, 400, 500,
    ]);
  });

  it("auto-knows exactly the six basics and preserves valid progress", () => {
    const state = parseCookingState(
      {
        version: 2,
        xp: 12_345,
        discoveredRecipeIds: [TEN_HIDDEN_IDS[0], "invalid_recipe"],
        researchScore: 77,
      },
      NOW,
    );

    expect(state.version).toBe(2);
    expect(state.xp).toBe(12_345);
    expect(state.researchScore).toBe(77);
    expect(state.discoveredRecipeIds).toEqual([
      ...BASIC_COOKING_RECIPE_IDS,
      TEN_HIDDEN_IDS[0],
    ]);
  });

  it("chooses the first specialty only at level 20 with ten hidden discoveries", () => {
    const ineligible = emptyCookingState(NOW);
    expect(() => chooseCookingSpecialty(ineligible, "hearth", NOW)).toThrow(
      "specialty_locked",
    );

    const eligible = parseCookingState(
      {
        ...emptyCookingState(NOW),
        xp: cookingLevelXpThreshold(20),
        discoveredRecipeIds: [...BASIC_COOKING_RECIPE_IDS, ...TEN_HIDDEN_IDS],
      },
      NOW,
    );
    const chosen = chooseCookingSpecialty(eligible, "hearth", NOW);
    expect(chosen.specialty).toEqual({ field: "hearth", xp: 0 });
    // 처음 고를 때는 대기가 없다.
    expect(chosen.specialtyChangedAt).toBeUndefined();
    expect(cookingSpecialtyNextChangeAt(chosen)).toBeNull();
    expect(() => chooseCookingSpecialty(chosen, "hearth", NOW)).toThrow(
      "specialty_unchanged",
    );
  });

  it("전문 분야를 바꾸면 분야별 숙련이 남고 고른 특화가 풀리며 7일 동안 다시 바꿀 수 없다", () => {
    expect(COOKING_SPECIALTY_CHANGE_COOLDOWN_MS).toBe(7 * 86_400_000);
    const hearth = parseCookingState(
      {
        ...emptyCookingState(NOW),
        specialty: { field: "hearth", xp: 17_460 },
        branch: { current: "hearth_grill", xp: { hearth_grill: 100 }, changedAt: null },
      },
      NOW,
    );

    const baking = chooseCookingSpecialty(hearth, "baking", NOW);
    expect(baking.specialty).toEqual({ field: "baking", xp: 0 });
    expect(baking.specialtyReserve).toEqual({ hearth: 17_460 });
    expect(baking.specialtyChangedAt).toBe(NOW);
    expect(baking.branch).toEqual({
      current: null,
      xp: { hearth_grill: 100 },
      changedAt: null,
    });

    const nextChangeAt = NOW + COOKING_SPECIALTY_CHANGE_COOLDOWN_MS;
    expect(cookingSpecialtyNextChangeAt(baking)).toBe(nextChangeAt);
    expect(() => chooseCookingSpecialty(baking, "hearth", nextChangeAt - 1)).toThrow(
      "specialty_cooldown",
    );

    // 돌아오면 남겨 둔 숙련을 이어서 쓴다.
    const grown = { ...baking, specialty: { field: "baking" as const, xp: 320 } };
    const back = chooseCookingSpecialty(grown, "hearth", nextChangeAt);
    expect(back.specialty).toEqual({ field: "hearth", xp: 17_460 });
    expect(back.specialtyReserve).toEqual({ baking: 320 });
    expect(back.specialtyChangedAt).toBe(nextChangeAt);
  });

  it("저장된 분야별 숙련과 변경 시각을 읽고 잘못된 값은 버린다", () => {
    const parsed = parseCookingState(
      {
        ...emptyCookingState(NOW),
        specialty: { field: "baking", xp: 320 },
        specialtyReserve: { hearth: 17_460.9, baking: 999, pot: -5, nowhere: 10 },
        specialtyChangedAt: NOW,
      },
      NOW,
    );
    // 지금 고른 분야의 숙련은 specialty 에만 둔다.
    expect(parsed.specialtyReserve).toEqual({ hearth: 17_460 });
    expect(parsed.specialtyChangedAt).toBe(NOW);

    const untouched = parseCookingState(emptyCookingState(NOW), NOW);
    expect("specialtyReserve" in untouched).toBe(false);
    expect("specialtyChangedAt" in untouched).toBe(false);
  });

  it("derives five bounded specialty ranks from accumulated xp", () => {
    expect(cookingSpecialtyRank(0)).toBe(1);
    expect(cookingSpecialtyRank(299)).toBe(2);
    expect(cookingSpecialtyRank(700)).toBe(4);
    expect(cookingSpecialtyRank(99_999)).toBe(5);
  });

  it("resets daily and weekly delivery progress on their own boundaries", () => {
    const previous = {
      ...emptyCookingState(NOW),
      daily: {
        dayKey: "2026-08-20",
        standingDeliveries: 10,
        requestScores: { old: 50 },
        completedRequestIds: ["old"],
      },
      weekly: {
        weekKey: "2026-W32",
        requestScore: 200,
        completed: true,
      },
    };
    const parsed = parseCookingState(previous, NOW);

    expect(parsed.daily.standingDeliveries).toBe(0);
    expect(parsed.daily.requestScores).toEqual({});
    expect(parsed.weekly.requestScore).toBe(0);
    expect(parsed.weekly.completed).toBe(false);
  });
});
