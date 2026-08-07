import { SUMMON_SCROLL_MATERIAL_ID } from "./coopBosses";
import { ENHANCE_STONE_MATERIAL_ID } from "./v2Enhance";

export type GuildAlchemyRecipeId =
  | "basic_solution"
  | "refined_solution"
  | "stable_catalyst"
  | "concentrated_solution"
  | "volatile_catalyst"
  | "summoning_ink"
  | "high_purity_solution"
  | "vitality_elixir"
  | "grand_solution";

export type GuildAlchemyChargeTarget = "hp" | "mp" | "balanced";

export type GuildAlchemyRecipe = {
  id: GuildAlchemyRecipeId;
  name: string;
  description: string;
  minFacilityLevel: number;
  energyCost: number;
  ingredients: { herb: number; silverleaf: number };
  output: "charge" | "stamina_potion" | "material";
  chargeAmount: number;
  staminaPotionAmount?: number;
  outputMaterialId?: string;
  outputMaterialName?: string;
  outputMaterialAmount?: number;
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
    output: "charge",
    chargeAmount: 100_000,
  },
  {
    id: "refined_solution",
    name: "정제 충전액",
    description: "허브의 불순물을 걷어내 충전 효율을 높입니다.",
    minFacilityLevel: 2,
    energyCost: 2,
    ingredients: { herb: 5, silverleaf: 0 },
    output: "charge",
    chargeAmount: 300_000,
  },
  {
    id: "stable_catalyst",
    name: "안정 강화 촉매",
    description: "은빛잎의 진정 성분으로 파괴 위험을 낮추는 푸른 강화석을 결정화합니다.",
    minFacilityLevel: 2,
    energyCost: 8,
    ingredients: { herb: 12, silverleaf: 1 },
    output: "material",
    chargeAmount: 0,
    outputMaterialId: ENHANCE_STONE_MATERIAL_ID.blue,
    outputMaterialName: "푸른 강화석",
    outputMaterialAmount: 1,
  },
  {
    id: "concentrated_solution",
    name: "농축 충전액",
    description: "은빛잎을 촉매로 사용해 고밀도 충전액을 증류합니다.",
    minFacilityLevel: 3,
    energyCost: 3,
    ingredients: { herb: 10, silverleaf: 1 },
    output: "charge",
    chargeAmount: 900_000,
  },
  {
    id: "volatile_catalyst",
    name: "격정 강화 촉매",
    description: "허브의 마력을 격렬하게 끓여 성공률을 끌어올리는 붉은 강화석을 만듭니다.",
    minFacilityLevel: 3,
    energyCost: 12,
    ingredients: { herb: 20, silverleaf: 2 },
    output: "material",
    chargeAmount: 0,
    outputMaterialId: ENHANCE_STONE_MATERIAL_ID.red,
    outputMaterialName: "붉은 강화석",
    outputMaterialAmount: 1,
  },
  {
    id: "summoning_ink",
    name: "소환의 잉크",
    description: "은빛잎에서 마력 잉크를 뽑아 협동 보스의 봉인을 여는 소환서를 복원합니다.",
    minFacilityLevel: 3,
    energyCost: 10,
    ingredients: { herb: 16, silverleaf: 2 },
    output: "material",
    chargeAmount: 0,
    outputMaterialId: SUMMON_SCROLL_MATERIAL_ID,
    outputMaterialName: "보스 소환서",
    outputMaterialAmount: 3,
  },
  {
    id: "high_purity_solution",
    name: "고순도 충전액",
    description: "정밀 촉매 공정으로 손실을 줄인 상급 충전액입니다.",
    minFacilityLevel: 4,
    energyCost: 4,
    ingredients: { herb: 15, silverleaf: 1 },
    output: "charge",
    chargeAmount: 1_600_000,
  },
  {
    id: "vitality_elixir",
    name: "활력 영약",
    description: "은빛잎의 생명력을 응축해 스태미나 회복약으로 완성합니다.",
    minFacilityLevel: 4,
    energyCost: 20,
    ingredients: { herb: 30, silverleaf: 4 },
    output: "stamina_potion",
    chargeAmount: 0,
    staminaPotionAmount: 1,
  },
  {
    id: "grand_solution",
    name: "대연금 충전액",
    description: "대연금 연구소에서만 완성할 수 있는 최고 순도의 충전액입니다.",
    minFacilityLevel: 5,
    energyCost: 5,
    ingredients: { herb: 24, silverleaf: 2 },
    output: "charge",
    chargeAmount: 3_600_000,
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
  if (recipe.output !== "charge") return { hp: 0, mp: 0, total: 0 };
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
