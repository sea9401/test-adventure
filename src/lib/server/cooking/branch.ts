// 요리 특화 서버 판정 — 요리 라우트가 제작·선택·조회에서 호출한다.

import {
  COOKING_BRANCH_BY_ID,
  COOKING_BRANCH_UNLOCK_SPECIALTY_XP,
  addCookingBranchXp,
  chooseCookingBranch,
  cookingBranchCovers,
  cookingBranchMasterpieceBonusPct,
  cookingBranchNextChangeAt,
  cookingBranchNextRankXp,
  cookingBranchRank,
  emptyCookingBranchState,
} from "@/adventure/v2/cooking/branch";
import { COOKING_BRANCH_RECIPE_BY_ID } from "@/adventure/v2/cooking/branchRecipes";
import type { CookingBranchView } from "@/adventure/v2/cooking/clientTypes";
import type { CookingStateV2 } from "@/adventure/v2/cooking/state";
import type { CookingRecipeSecret } from "@/adventure/v2/cooking/types";

export type CookingBranchCraftContext = {
  /** 이 레시피를 만들 수 있는지. 전용 요리가 아니면 항상 true 다(발견 여부는 라우트가 따로 본다). */
  allowed: boolean;
  /** 지금 고른 특화에 속한 음식인지. */
  covered: boolean;
  masterpieceBonusPct: number;
  branchXpPerDish: number;
};

const NOT_COVERED = { covered: false, masterpieceBonusPct: 0, branchXpPerDish: 0 };

export function cookingBranchCraftContext(
  cooking: CookingStateV2,
  recipe: CookingRecipeSecret,
): CookingBranchCraftContext {
  const state = cooking.branch ?? emptyCookingBranchState();
  const branch = state.current ? COOKING_BRANCH_BY_ID.get(state.current) : undefined;
  const rank = cookingBranchRank(state);
  const exclusive = COOKING_BRANCH_RECIPE_BY_ID.get(recipe.id);
  if (exclusive) {
    const allowed =
      branch !== undefined &&
      exclusive.branchId === branch.id &&
      rank >= exclusive.requiredRank;
    if (!allowed) return { allowed: false, ...NOT_COVERED };
  } else if (!branch || !cookingBranchCovers(branch, recipe)) {
    return { allowed: true, ...NOT_COVERED };
  }
  return {
    allowed: true,
    covered: true,
    masterpieceBonusPct: cookingBranchMasterpieceBonusPct(rank),
    branchXpPerDish: recipe.tier * 10,
  };
}

export function applyCookingBranchCraft(
  cooking: CookingStateV2,
  recipe: CookingRecipeSecret,
  quantity: number,
): CookingStateV2 {
  const context = cookingBranchCraftContext(cooking, recipe);
  if (!context.covered || !cooking.branch) return cooking;
  const branch = addCookingBranchXp(
    cooking.branch,
    context.branchXpPerDish * Math.max(0, Math.floor(quantity)),
  );
  return branch === cooking.branch ? cooking : { ...cooking, branch };
}

export function applyCookingBranchChoice(
  cooking: CookingStateV2,
  branchId: unknown,
  now: number,
): CookingStateV2 {
  return {
    ...cooking,
    branch: chooseCookingBranch({
      state: cooking.branch ?? emptyCookingBranchState(),
      specialty: cooking.specialty,
      branchId,
      now,
    }),
  };
}

export function cookingBranchView(
  cooking: CookingStateV2,
  now: number,
): CookingBranchView {
  const state = cooking.branch ?? emptyCookingBranchState();
  const rank = cookingBranchRank(state);
  const xp = state.current ? state.xp[state.current] ?? 0 : 0;
  const nextChangeAt = cookingBranchNextChangeAt(state);
  return {
    eligible: (cooking.specialty?.xp ?? 0) >= COOKING_BRANCH_UNLOCK_SPECIALTY_XP,
    current: state.current,
    rank,
    xp,
    nextRankXp: state.current ? cookingBranchNextRankXp(xp) : null,
    xpByBranch: { ...state.xp },
    nextChangeAt: nextChangeAt !== null && nextChangeAt > now ? nextChangeAt : null,
    masterpieceBonusPct: cookingBranchMasterpieceBonusPct(rank),
  };
}
