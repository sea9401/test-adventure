import type { CookingEffect } from "../cooking/types";
import { cookingEffectText } from "../cooking/foodShared";
import { SURFACE_INSET } from "@/components/ui/surfaces";

export type MarketplaceFoodPreview = { effect: CookingEffect; durationMs: number };

export function MarketplaceFoodEffect({ food }: { food?: MarketplaceFoodPreview }) {
  if (!food) return null;
  const minutes = Math.round(food.durationMs / 60_000);
  const duration = minutes % 60 === 0 ? `${minutes / 60}시간` : `${minutes}분`;
  return (
    <div className={`${SURFACE_INSET} mt-2 p-2 text-xs`}>
      <p className="font-semibold">요리 효과 · {duration}</p>
      <p className="mt-1">{cookingEffectText(food.effect)}</p>
      <p className="mt-1 text-zinc-500 dark:text-zinc-400">표시된 품질·원조·전문 보정이 적용된 1개 섭취 효과입니다.</p>
    </div>
  );
}
