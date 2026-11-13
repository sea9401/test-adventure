// 요리 특화 — 전문 분야 랭크 5 뒤에 분야 안에서 고르는 더 좁은 갈래.
// 특화에 속한 음식을 만들면 특화 숙련이 쌓이고, 랭크에 따라 걸작 확률과 전용 요리가 열린다.
// 화면도 읽는 순수 모듈이라 서버 전용 요리 카탈로그에 의존하지 않는다.

import type { CookingField, CookingMethod } from "./types";

export type CookingBranchId =
  | "hearth_grill"
  | "hearth_fry"
  | "hearth_stir"
  | "pot_soup"
  | "pot_steam"
  | "baking_pastry"
  | "baking_bread"
  | "baking_steamed"
  | "seafood_fire"
  | "seafood_stew"
  | "seafood_pickle"
  | "medicinal_tea"
  | "medicinal_ferment"
  | "medicinal_meal";

export type CookingBranch = {
  id: CookingBranchId;
  field: CookingField;
  name: string;
  methods: readonly CookingMethod[];
};

export const COOKING_BRANCHES: readonly CookingBranch[] = [
  { id: "hearth_grill", field: "hearth", name: "구이", methods: ["grill"] },
  { id: "hearth_fry", field: "hearth", name: "튀김", methods: ["fry"] },
  { id: "hearth_stir", field: "hearth", name: "볶음", methods: ["stir_fry"] },
  { id: "pot_soup", field: "pot", name: "국물", methods: ["boil"] },
  { id: "pot_steam", field: "pot", name: "찜", methods: ["steam"] },
  { id: "baking_pastry", field: "baking", name: "제과", methods: ["bake"] },
  { id: "baking_bread", field: "baking", name: "제빵", methods: ["ferment"] },
  { id: "baking_steamed", field: "baking", name: "찜과자", methods: ["steam", "boil"] },
  { id: "seafood_fire", field: "seafood", name: "직화", methods: ["grill", "stir_fry", "fry"] },
  { id: "seafood_stew", field: "seafood", name: "탕·찜", methods: ["boil", "steam"] },
  { id: "seafood_pickle", field: "seafood", name: "절임", methods: ["ferment"] },
  { id: "medicinal_tea", field: "medicinal", name: "차", methods: ["brew"] },
  { id: "medicinal_ferment", field: "medicinal", name: "발효", methods: ["ferment"] },
  { id: "medicinal_meal", field: "medicinal", name: "약선식", methods: ["boil", "steam"] },
];

export const COOKING_BRANCH_BY_ID: ReadonlyMap<CookingBranchId, CookingBranch> =
  new Map(COOKING_BRANCHES.map((branch) => [branch.id, branch]));

/** 특화를 고를 수 있는 전문 숙련(전문 분야 랭크 5). */
export const COOKING_BRANCH_UNLOCK_SPECIALTY_XP = 1_500;
export const COOKING_BRANCH_CHANGE_COOLDOWN_MS = 14 * 86_400_000;
export const COOKING_BRANCH_MAX_RANK = 5;
/** 인덱스 = 랭크 − 1 의 누적 특화 숙련. */
export const COOKING_BRANCH_RANK_XP: readonly number[] = [0, 1_000, 3_000, 7_000, 15_000];
export const COOKING_BRANCH_MASTERPIECE_PCT_PER_RANK = 2;
/** 전용 요리가 열리는 랭크. */
export const COOKING_BRANCH_DISH_RANKS = [1, 3, 5] as const;

export type CookingBranchRank = 1 | 2 | 3 | 4 | 5;

export type CookingBranchState = {
  current: CookingBranchId | null;
  xp: Partial<Record<CookingBranchId, number>>;
  /** 마지막으로 특화를 바꾼 시각. 처음 고를 때는 null 로 둔다. */
  changedAt: number | null;
};

export type CookingBranchChooseError =
  | "branch_locked"
  | "invalid_branch"
  | "branch_unchanged"
  | "branch_cooldown";

export function isCookingBranchId(value: unknown): value is CookingBranchId {
  return typeof value === "string" && COOKING_BRANCH_BY_ID.has(value as CookingBranchId);
}

export function emptyCookingBranchState(): CookingBranchState {
  return { current: null, xp: {}, changedAt: null };
}

function safeXp(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
}

export function parseCookingBranchState(
  raw: unknown,
  specialtyField: CookingField | null,
): CookingBranchState {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return emptyCookingBranchState();
  }
  const value = raw as Record<string, unknown>;
  const xp: Partial<Record<CookingBranchId, number>> = {};
  if (value.xp && typeof value.xp === "object" && !Array.isArray(value.xp)) {
    for (const [id, amount] of Object.entries(value.xp as Record<string, unknown>)) {
      if (!isCookingBranchId(id)) continue;
      const safe = safeXp(amount);
      if (safe > 0) xp[id] = safe;
    }
  }
  const current =
    isCookingBranchId(value.current) &&
    specialtyField !== null &&
    COOKING_BRANCH_BY_ID.get(value.current)!.field === specialtyField
      ? value.current
      : null;
  const changedAt =
    typeof value.changedAt === "number" && Number.isFinite(value.changedAt)
      ? value.changedAt
      : null;
  return { current, xp, changedAt };
}

export function cookingBranchRankForXp(xp: number): CookingBranchRank {
  const safe = safeXp(xp);
  let rank = 1;
  while (rank < COOKING_BRANCH_MAX_RANK && safe >= COOKING_BRANCH_RANK_XP[rank]) {
    rank += 1;
  }
  return rank as CookingBranchRank;
}

/** 다음 랭크의 누적 요구량. 최고 랭크면 null. */
export function cookingBranchNextRankXp(xp: number): number | null {
  const rank = cookingBranchRankForXp(xp);
  return rank >= COOKING_BRANCH_MAX_RANK ? null : COOKING_BRANCH_RANK_XP[rank];
}

/** 지금 고른 특화의 랭크. 고르지 않았으면 0. */
export function cookingBranchRank(state: CookingBranchState): number {
  return state.current ? cookingBranchRankForXp(state.xp[state.current] ?? 0) : 0;
}

export function cookingBranchMasterpieceBonusPct(rank: number): number {
  const safeRank = Math.max(0, Math.min(COOKING_BRANCH_MAX_RANK, Math.floor(Number(rank) || 0)));
  return safeRank * COOKING_BRANCH_MASTERPIECE_PCT_PER_RANK;
}

export function cookingBranchCovers(
  branch: CookingBranch,
  recipe: { field: CookingField; method: CookingMethod },
): boolean {
  return branch.field === recipe.field && branch.methods.includes(recipe.method);
}

export function cookingBranchesForField(field: CookingField): CookingBranch[] {
  return COOKING_BRANCHES.filter((branch) => branch.field === field);
}

/** 다시 바꿀 수 있는 시각. 바꾼 적이 없으면 null. 지났는지는 호출하는 쪽이 now 와 견준다. */
export function cookingBranchNextChangeAt(state: CookingBranchState): number | null {
  return state.changedAt === null
    ? null
    : state.changedAt + COOKING_BRANCH_CHANGE_COOLDOWN_MS;
}

export function chooseCookingBranch(args: {
  state: CookingBranchState;
  specialty: { field: CookingField; xp: number } | null;
  branchId: unknown;
  now: number;
}): CookingBranchState {
  const { state, specialty, branchId, now } = args;
  if (!specialty || specialty.xp < COOKING_BRANCH_UNLOCK_SPECIALTY_XP) {
    throw new Error("branch_locked" satisfies CookingBranchChooseError);
  }
  if (
    !isCookingBranchId(branchId) ||
    COOKING_BRANCH_BY_ID.get(branchId)!.field !== specialty.field
  ) {
    throw new Error("invalid_branch" satisfies CookingBranchChooseError);
  }
  if (state.current === branchId) {
    throw new Error("branch_unchanged" satisfies CookingBranchChooseError);
  }
  if (state.current === null) {
    return { ...state, current: branchId };
  }
  const nextChangeAt = cookingBranchNextChangeAt(state);
  if (nextChangeAt !== null && now < nextChangeAt) {
    throw new Error("branch_cooldown" satisfies CookingBranchChooseError);
  }
  return { ...state, current: branchId, changedAt: now };
}

export function addCookingBranchXp(
  state: CookingBranchState,
  amount: number,
): CookingBranchState {
  const gained = safeXp(amount);
  if (!state.current || gained <= 0) return state;
  return {
    ...state,
    xp: { ...state.xp, [state.current]: (state.xp[state.current] ?? 0) + gained },
  };
}
