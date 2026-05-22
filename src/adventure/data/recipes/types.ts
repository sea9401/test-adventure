import { craftHasVariance, type CraftVariance } from "../craftQuality";
import { ITEMS, type EquipSlot, type EquipTier, type ItemId } from "../items";
import type { MaterialId } from "../materials";
import type { PotionId } from "../potions";

export type { CraftVariance } from "../craftQuality";
export type { EquipSlot } from "../items";

export type RecipeIngredient =
  | { kind: "material"; materialId: MaterialId; count: number }
  | { kind: "equip"; itemId: ItemId; count: number };

export type RecipeResult =
  | { kind: "equipment"; itemId: ItemId; slot: EquipSlot }
  | { kind: "potion"; potionId: PotionId; quantity: number };

// CraftVariance(variance / varianceTable) 를 합쳐 — 둘 다 옵셔널, equipment 결과에만 의미.
export type Recipe = CraftVariance & {
  id: string;
  name: string;
  description: string;
  ingredients: RecipeIngredient[];
  result: RecipeResult;
  /** 거래소 등록 / 우편 선물 가능 여부. 미지정/true → 가능. */
  tradable?: boolean;
  /**
   * 제작 골드 비용 오버라이드. 미지정이면 출력 장비 티어에서 자동 산출(recipeGoldCost).
   * 골드 싱크(game-fun-audit 보조문제) — 저티어 싸게, 고티어 비싸게. 포션 결과는 0.
   */
  gold?: number;
};

// 레시피에 품질 변동 정의(variance / varianceTable)가 있는지 — 서버가 등급 추첨 여부를 결정.
export function recipeHasVariance(recipe: Recipe): boolean {
  return craftHasVariance(recipe);
}

// 티어별 제작 골드 — 저티어 싸게(초보 무영향), 고티어만 비싸게. RDS 실측(만렙 median 82k)에
// 맞춰 고티어 하향(t3 800→600, t4 3k→2k, t5 10k→5k, t6 30k→12k). 실측 후 재튜닝.
const RECIPE_GOLD_BY_TIER: Record<EquipTier, number> = {
  1: 50,
  2: 200,
  3: 600,
  4: 2000,
  5: 5000,
  6: 12000,
};

// 레시피 1회 제작 골드 비용. 명시 gold 오버라이드 우선, 없으면 장비 티어 자동 산출.
// 포션 결과는 0(가루 등으로 만드는 소비재라 골드 싱크 대상 아님).
export function recipeGoldCost(recipe: Recipe): number {
  if (typeof recipe.gold === "number") return Math.max(0, recipe.gold);
  if (recipe.result.kind !== "equipment") return 0;
  const item = ITEMS[recipe.result.itemId] as { tier?: EquipTier } | undefined;
  const tier = item?.tier ?? 1;
  return RECIPE_GOLD_BY_TIER[tier] ?? 0;
}
