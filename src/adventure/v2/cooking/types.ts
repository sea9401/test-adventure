import type { V2StatKey } from "@/adventure/data/v2/v2StatKeys";

export type CookingField =
  | "hearth"
  | "pot"
  | "baking"
  | "seafood"
  | "medicinal";

export type CookingMethod =
  | "grill"
  | "boil"
  | "stir_fry"
  | "fry"
  | "steam"
  | "bake"
  | "brew"
  | "ferment";

export type CookingDiscoveryClass = "basic" | "hidden" | "signature";
export type CookingIngredientKind =
  | "farm"
  | "fishing"
  | "pantry"
  | "processed";
export type CookingIngredientId = `${CookingIngredientKind}:${string}`;

export type CookingCombatFlatKey =
  | "atk"
  | "magicAtk"
  | "def"
  | "magicDef"
  | "maxHp"
  | "maxMp"
  | "accuracy";

export type CookingEffectTag =
  | "offense"
  | "defense"
  | "recovery"
  | "hunt_exp"
  | "hunt_gold"
  | "life";

export type CookingEffect = {
  primaryFlat?: Partial<Record<V2StatKey, number>>;
  primaryPct?: Partial<Record<V2StatKey, number>>;
  combatFlat?: Partial<Record<CookingCombatFlatKey, number>>;
  huntExpPct?: number;
  huntGoldPct?: number;
  cookingXpPct?: number;
};

export type CookingRecipePublic = {
  id: string;
  name: string;
  icon: string;
  imageSrc: string;
  field: CookingField;
  method: CookingMethod;
  tier: 1 | 2 | 3 | 4 | 5;
  requiredLevel: 1 | 10 | 20 | 35 | 50;
  discovery: CookingDiscoveryClass;
  effect: CookingEffect;
  effectTags: readonly CookingEffectTag[];
  description: string;
};

export type CookingSecretIngredient = {
  id: CookingIngredientId;
  count: number;
};

export type CookingRecipeSecret = CookingRecipePublic & {
  ingredients: readonly CookingSecretIngredient[];
  researchXp: number;
  craftXp: number;
};

export const COOKING_FIELD_NAMES: Record<CookingField, string> = {
  hearth: "화덕",
  pot: "냄비",
  baking: "제과",
  seafood: "해산물",
  medicinal: "약선",
};

export const COOKING_METHOD_NAMES: Record<CookingMethod, string> = {
  grill: "굽기",
  boil: "끓이기",
  stir_fry: "볶기",
  fry: "튀기기",
  steam: "찌기",
  bake: "오븐",
  brew: "우리기",
  ferment: "발효",
};

export const COOKING_METHOD_UNLOCK_LEVEL: Record<
  CookingMethod,
  1 | 10 | 20 | 35
> = {
  grill: 1,
  boil: 1,
  stir_fry: 10,
  fry: 10,
  steam: 20,
  bake: 20,
  brew: 35,
  ferment: 35,
};
