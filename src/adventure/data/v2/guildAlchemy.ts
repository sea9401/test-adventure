export type GuildAlchemyRecipeId =
  | "basic_solution"
  | "refined_solution"
  | "concentrated_solution"
  | "high_purity_solution"
  | "grand_solution";

export type GuildAlchemyChargeTarget = "hp" | "mp" | "balanced";

export type GuildAlchemyRecipe = {
  id: GuildAlchemyRecipeId;
  name: string;
  description: string;
  minFacilityLevel: number;
  energyCost: number;
  ingredients: { herb: number; silverleaf: number };
  chargeAmount: number;
};

export type GuildAlchemyWeeklyState = {
  weekKey: string;
  energyUsed: number;
};

export const GUILD_ALCHEMY_RECIPES: readonly GuildAlchemyRecipe[] = [
  {
    id: "basic_solution",
    name: "기초 충전액",
    description: "잘게 빻은 허브에서 기본 충전액을 추출합니다.",
    minFacilityLevel: 1,
    energyCost: 1,
    ingredients: { herb: 2, silverleaf: 0 },
    chargeAmount: 25_000,
  },
  {
    id: "refined_solution",
    name: "정제 충전액",
    description: "허브의 불순물을 걷어내 충전 효율을 높입니다.",
    minFacilityLevel: 2,
    energyCost: 2,
    ingredients: { herb: 5, silverleaf: 0 },
    chargeAmount: 75_000,
  },
  {
    id: "concentrated_solution",
    name: "농축 충전액",
    description: "은빛잎을 촉매로 사용해 고밀도 충전액을 증류합니다.",
    minFacilityLevel: 3,
    energyCost: 3,
    ingredients: { herb: 10, silverleaf: 1 },
    chargeAmount: 225_000,
  },
  {
    id: "high_purity_solution",
    name: "고순도 충전액",
    description: "정밀 촉매 공정으로 손실을 줄인 상급 충전액입니다.",
    minFacilityLevel: 4,
    energyCost: 4,
    ingredients: { herb: 15, silverleaf: 1 },
    chargeAmount: 400_000,
  },
  {
    id: "grand_solution",
    name: "대연금 충전액",
    description: "대연금 연구소에서만 완성할 수 있는 최고 순도의 충전액입니다.",
    minFacilityLevel: 5,
    energyCost: 5,
    ingredients: { herb: 24, silverleaf: 2 },
    chargeAmount: 900_000,
  },
];

export function guildAlchemyRecipe(
  id: unknown,
): GuildAlchemyRecipe | null {
  if (typeof id !== "string") return null;
  return GUILD_ALCHEMY_RECIPES.find((recipe) => recipe.id === id) ?? null;
}

export function parseGuildAlchemyWeeklyState(
  raw: unknown,
  weekKey: string,
): GuildAlchemyWeeklyState {
  if (!raw || typeof raw !== "object") return { weekKey, energyUsed: 0 };
  const value = raw as Record<string, unknown>;
  if (value.weekKey !== weekKey) return { weekKey, energyUsed: 0 };
  const parsed = Math.floor(Number(value.energyUsed) || 0);
  return { weekKey, energyUsed: Math.max(0, parsed) };
}

export function guildAlchemyChargeGain(
  recipe: GuildAlchemyRecipe,
  target: GuildAlchemyChargeTarget,
  quantity: number,
): { hp: number; mp: number; total: number } {
  const safeQuantity = Math.max(0, Math.floor(Number(quantity) || 0));
  const total = recipe.chargeAmount * safeQuantity;
  if (target === "hp") return { hp: total, mp: 0, total };
  if (target === "mp") return { hp: 0, mp: total, total };
  const hp = Math.floor(total / 2);
  return { hp, mp: total - hp, total };
}

export function isGuildAlchemyChargeTarget(
  value: unknown,
): value is GuildAlchemyChargeTarget {
  return value === "hp" || value === "mp" || value === "balanced";
}
