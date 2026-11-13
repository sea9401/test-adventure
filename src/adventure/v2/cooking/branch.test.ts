import { describe, expect, it } from "vitest";
import {
  COOKING_BRANCHES,
  COOKING_BRANCH_BY_ID,
  COOKING_BRANCH_CHANGE_COOLDOWN_MS,
  COOKING_BRANCH_DISH_RANKS,
  COOKING_BRANCH_MAX_RANK,
  COOKING_BRANCH_RANK_XP,
  COOKING_BRANCH_UNLOCK_SPECIALTY_XP,
  addCookingBranchXp,
  chooseCookingBranch,
  cookingBranchCovers,
  cookingBranchMasterpieceBonusPct,
  cookingBranchNextChangeAt,
  cookingBranchNextRankXp,
  cookingBranchRank,
  cookingBranchRankForXp,
  cookingBranchesForField,
  emptyCookingBranchState,
  isCookingBranchId,
  parseCookingBranchState,
  type CookingBranchState,
} from "./branch";

const NOW = 1_800_000_000_000;
const DAY = 86_400_000;
const BAKER = { field: "baking" as const, xp: 1_500 };

function errorCode(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return "no_error";
}

describe("요리 특화 규칙", () => {
  it("특화 14개와 분야별 구성", () => {
    expect(COOKING_BRANCHES).toHaveLength(14);
    expect(COOKING_BRANCH_BY_ID.size).toBe(14);
    const ids = (field: Parameters<typeof cookingBranchesForField>[0]) =>
      cookingBranchesForField(field).map((branch) => branch.id);
    expect(ids("hearth")).toEqual(["hearth_grill", "hearth_fry", "hearth_stir"]);
    expect(ids("pot")).toEqual(["pot_soup", "pot_steam"]);
    expect(ids("baking")).toEqual(["baking_pastry", "baking_bread", "baking_steamed"]);
    expect(ids("seafood")).toEqual(["seafood_fire", "seafood_stew", "seafood_pickle"]);
    expect(ids("medicinal")).toEqual(["medicinal_tea", "medicinal_ferment", "medicinal_meal"]);
  });

  it("특화 이름과 조리법", () => {
    const rows = COOKING_BRANCHES.map((branch) => [branch.id, branch.name, [...branch.methods]]);
    expect(rows).toEqual([
      ["hearth_grill", "구이", ["grill"]],
      ["hearth_fry", "튀김", ["fry"]],
      ["hearth_stir", "볶음", ["stir_fry"]],
      ["pot_soup", "국물", ["boil"]],
      ["pot_steam", "찜", ["steam"]],
      ["baking_pastry", "제과", ["bake"]],
      ["baking_bread", "제빵", ["ferment"]],
      ["baking_steamed", "찜과자", ["steam", "boil"]],
      ["seafood_fire", "직화", ["grill", "stir_fry", "fry"]],
      ["seafood_stew", "탕·찜", ["boil", "steam"]],
      ["seafood_pickle", "절임", ["ferment"]],
      ["medicinal_tea", "차", ["brew"]],
      ["medicinal_ferment", "발효", ["ferment"]],
      ["medicinal_meal", "약선식", ["boil", "steam"]],
    ]);
  });

  it("한 분야 안에서 조리법이 겹치지 않는다", () => {
    for (const field of ["hearth", "pot", "baking", "seafood", "medicinal"] as const) {
      const methods = cookingBranchesForField(field).flatMap((branch) => branch.methods);
      expect(new Set(methods).size).toBe(methods.length);
    }
  });

  it("상수", () => {
    expect(COOKING_BRANCH_UNLOCK_SPECIALTY_XP).toBe(1_500);
    expect(COOKING_BRANCH_CHANGE_COOLDOWN_MS).toBe(14 * DAY);
    expect(COOKING_BRANCH_MAX_RANK).toBe(5);
    expect(COOKING_BRANCH_RANK_XP).toEqual([0, 1_000, 3_000, 7_000, 15_000]);
    expect(COOKING_BRANCH_DISH_RANKS).toEqual([1, 3, 5]);
  });

  it("랭크 경계", () => {
    const rank = cookingBranchRankForXp;
    expect([0, 999, 1_000, 2_999, 3_000, 6_999, 7_000, 14_999, 15_000, 999_999].map(rank)).toEqual([
      1, 1, 2, 2, 3, 3, 4, 4, 5, 5,
    ]);
    expect(rank(-5)).toBe(1);
    expect(rank(Number.NaN)).toBe(1);
    expect(cookingBranchNextRankXp(0)).toBe(1_000);
    expect(cookingBranchNextRankXp(1_000)).toBe(3_000);
    expect(cookingBranchNextRankXp(14_999)).toBe(15_000);
    expect(cookingBranchNextRankXp(15_000)).toBeNull();
  });

  it("고르지 않았으면 랭크 0, 걸작 보너스는 랭크당 2%p", () => {
    expect(cookingBranchRank(emptyCookingBranchState())).toBe(0);
    expect(
      cookingBranchRank({ current: "baking_bread", xp: { baking_bread: 3_200, baking_pastry: 15_000 }, changedAt: null }),
    ).toBe(3);
    expect([0, 1, 2, 3, 4, 5].map(cookingBranchMasterpieceBonusPct)).toEqual([0, 2, 4, 6, 8, 10]);
    expect(cookingBranchMasterpieceBonusPct(9)).toBe(10);
    expect(cookingBranchMasterpieceBonusPct(-1)).toBe(0);
  });

  it("분야와 조리법이 모두 맞아야 특화에 속한다", () => {
    const covers = (id: string, field: string, method: string) =>
      cookingBranchCovers(COOKING_BRANCH_BY_ID.get(id as never)!, { field, method } as never);
    expect(covers("baking_pastry", "baking", "bake")).toBe(true);
    expect(covers("baking_pastry", "baking", "ferment")).toBe(false);
    expect(covers("baking_bread", "baking", "ferment")).toBe(true);
    expect(covers("baking_bread", "medicinal", "ferment")).toBe(false);
    expect(covers("pot_steam", "pot", "steam")).toBe(true);
    expect(covers("baking_steamed", "baking", "steam")).toBe(true);
    expect(covers("baking_steamed", "baking", "boil")).toBe(true);
    expect(covers("baking_steamed", "pot", "steam")).toBe(false);
    expect(covers("seafood_fire", "seafood", "fry")).toBe(true);
    expect(covers("seafood_fire", "hearth", "fry")).toBe(false);
  });

  it("세이브를 정리해 읽는다", () => {
    expect(parseCookingBranchState(undefined, "baking")).toEqual(emptyCookingBranchState());
    expect(parseCookingBranchState("x", "baking")).toEqual(emptyCookingBranchState());
    expect(
      parseCookingBranchState(
        {
          current: "baking_bread",
          xp: { baking_bread: 1_234.9, baking_pastry: -5, hearth_grill: 40, sushi: 99, pot_soup: "7" },
          changedAt: NOW,
        },
        "baking",
      ),
    ).toEqual({ current: "baking_bread", xp: { baking_bread: 1_234, hearth_grill: 40 }, changedAt: NOW });
    // 전문 분야와 맞지 않는 특화는 고르지 않은 것으로 읽는다. 숙련은 남긴다.
    expect(
      parseCookingBranchState({ current: "hearth_grill", xp: { hearth_grill: 500 }, changedAt: NOW }, "baking"),
    ).toEqual({ current: null, xp: { hearth_grill: 500 }, changedAt: NOW });
    expect(
      parseCookingBranchState({ current: "baking_bread", xp: {}, changedAt: "soon" }, null),
    ).toEqual({ current: null, xp: {}, changedAt: null });
    expect(parseCookingBranchState({ current: "sushi" }, "baking").current).toBeNull();
    expect(isCookingBranchId("baking_bread")).toBe(true);
    expect(isCookingBranchId("sushi")).toBe(false);
    expect(isCookingBranchId(3)).toBe(false);
  });

  it("전문 랭크 5와 자기 분야 특화만 고를 수 있다", () => {
    const empty = emptyCookingBranchState();
    const choose = (specialty: { field: "baking" | "hearth"; xp: number } | null, branchId: unknown, state = empty) =>
      errorCode(() => chooseCookingBranch({ state, specialty, branchId, now: NOW }));

    expect(choose(null, "baking_bread")).toBe("branch_locked");
    expect(choose({ field: "baking", xp: 1_499 }, "baking_bread")).toBe("branch_locked");
    expect(choose(BAKER, "hearth_grill")).toBe("invalid_branch");
    expect(choose(BAKER, "sushi")).toBe("invalid_branch");
    expect(choose(BAKER, undefined)).toBe("invalid_branch");
    expect(choose(BAKER, "baking_bread")).toBe("no_error");
  });

  it("처음 고를 때는 대기가 없고 바꾸면 14일을 기다린다", () => {
    const first = chooseCookingBranch({
      state: emptyCookingBranchState(),
      specialty: BAKER,
      branchId: "baking_bread",
      now: NOW,
    });
    expect(first).toEqual({ current: "baking_bread", xp: {}, changedAt: null });
    expect(cookingBranchNextChangeAt(first)).toBeNull();

    expect(
      errorCode(() => chooseCookingBranch({ state: first, specialty: BAKER, branchId: "baking_bread", now: NOW })),
    ).toBe("branch_unchanged");

    const withXp: CookingBranchState = { ...first, xp: { baking_bread: 3_000 } };
    const changed = chooseCookingBranch({
      state: withXp,
      specialty: BAKER,
      branchId: "baking_pastry",
      now: NOW + 1,
    });
    expect(changed).toEqual({ current: "baking_pastry", xp: { baking_bread: 3_000 }, changedAt: NOW + 1 });
    expect(cookingBranchNextChangeAt(changed)).toBe(NOW + 1 + 14 * DAY);
    expect(cookingBranchRank(changed)).toBe(1);

    const tooSoon = () =>
      chooseCookingBranch({ state: changed, specialty: BAKER, branchId: "baking_bread", now: NOW + 14 * DAY });
    expect(errorCode(tooSoon)).toBe("branch_cooldown");
    const back = chooseCookingBranch({
      state: changed,
      specialty: BAKER,
      branchId: "baking_bread",
      now: NOW + 1 + 14 * DAY,
    });
    expect(back.current).toBe("baking_bread");
    expect(back.changedAt).toBe(NOW + 1 + 14 * DAY);
    // 돌아오면 쌓아 둔 숙련을 이어 쓴다.
    expect(cookingBranchRank(back)).toBe(3);
  });

  it("숙련은 지금 고른 특화에만 쌓인다", () => {
    expect(addCookingBranchXp(emptyCookingBranchState(), 500)).toEqual(emptyCookingBranchState());
    const state: CookingBranchState = { current: "pot_soup", xp: { pot_steam: 70 }, changedAt: null };
    expect(addCookingBranchXp(state, 30)).toEqual({ current: "pot_soup", xp: { pot_steam: 70, pot_soup: 30 }, changedAt: null });
    expect(addCookingBranchXp(state, 0)).toBe(state);
    expect(addCookingBranchXp(state, -9)).toBe(state);
    expect(addCookingBranchXp(state, 12.7).xp.pot_soup).toBe(12);
    expect(state.xp).toEqual({ pot_steam: 70 });
  });
});
