import { craftHasVariance, type CraftVariance } from "../craftQuality";
import type { EquipSlot, ItemId } from "../items";
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
};

// 레시피에 품질 변동 정의(variance / varianceTable)가 있는지 — 서버가 등급 추첨 여부를 결정.
export function recipeHasVariance(recipe: Recipe): boolean {
  return craftHasVariance(recipe);
}
