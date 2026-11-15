import type { CookingResponse } from "./clientTypes";
import type { CookingIngredientId } from "./types";
import { isCookingFarmIngredientId } from "./researchIngredients";

export function cookingIngredientName(data: CookingResponse, ingredientId: CookingIngredientId): string {
  const [kind, id] = ingredientId.split(":");
  if (kind === "farm") return data.farmItemDefinitions[id]?.name ?? id;
  if (kind === "fishing") return data.fishingItemDefinitions[id]?.name ?? id;
  const pantry = data.pantryItems.find((entry) => entry.id === ingredientId);
  if (pantry) return pantry.name;
  return data.processingRecipes.find((entry) => entry.outputId === ingredientId)?.name ?? id;
}

export function cookingIngredientCount(data: CookingResponse, ingredientId: CookingIngredientId): number {
  const [kind, id] = ingredientId.split(":");
  if (kind === "farm") return data.farmItems[id as keyof typeof data.farmItems] ?? 0;
  if (kind === "fishing") return data.fishingItems[id as keyof typeof data.fishingItems] ?? 0;
  return data.kitchenItems[ingredientId as keyof typeof data.kitchenItems] ?? 0;
}

export function cookingResearchIngredients(data: CookingResponse): CookingIngredientId[] {
  const farm = Object.keys(data.farmItemDefinitions)
    .filter(isCookingFarmIngredientId)
    .map((id) => `farm:${id}` as CookingIngredientId);
  const fishing = Object.keys(data.fishingItemDefinitions).map((id) => `fishing:${id}` as CookingIngredientId);
  const kitchen = [
    ...data.pantryItems.map((entry) => entry.id),
    ...data.processingRecipes.map((entry) => entry.outputId),
  ];
  return [...farm, ...fishing, ...kitchen].filter((id) => cookingIngredientCount(data, id) > 0);
}

const CHANGE_TIME_FORMAT = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** 전문 분야·특화를 다시 바꿀 수 있는 시각(한국 시간). 대기가 하루라 날짜만으로는 언제부터인지 알 수 없다. */
export function formatCookingChangeTime(timestamp: number): string {
  return CHANGE_TIME_FORMAT.format(new Date(timestamp));
}
