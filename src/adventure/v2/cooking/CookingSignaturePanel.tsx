"use client";

import { Medal } from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import { LIFE_MAJOR_PRODUCTS } from "../lifeMajorProducts";
import type { CookingFoodId } from "./foodShared";
import type { CookingMutation, CookingResponse } from "./clientTypes";

// 명장 요리 — 요리 주전공 명장 3단계 이상. 보유 걸작 1 + 명장 작물(해산물 분야는 명장 어획) 1로
// 같은 레시피의 명장 요리를 만든다. 명장 요리는 효과가 더 크고 지속시간이 2배다.
export function CookingSignaturePanel({ data, busy, mutate }: {
  data: CookingResponse;
  busy: boolean;
  mutate: CookingMutation;
}) {
  const masterpieces = Object.entries(data.cookingFoods).flatMap(([id, count]) => {
    const food = data.cookingFoodDefinitions[id as CookingFoodId];
    return food && food.quality === "masterpiece" && (count ?? 0) > 0
      ? [{ id: id as CookingFoodId, food, count: count ?? 0 }]
      : [];
  });

  return (
    <section className={`${SURFACE_CARD} space-y-3 p-4`}>
      <div>
        <h2 className="flex items-center gap-1.5 font-bold text-zinc-900 dark:text-zinc-100">
          <Medal size={20} weight="duotone" className="text-amber-500" aria-hidden />
          명장 요리
        </h2>
        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
          걸작 요리 1개와 명장 산물 1개로 효과가 더 크고 24시간 지속되는 명장 요리를 만듭니다.
        </p>
      </div>
      {masterpieces.length === 0 ? (
        <EmptyState
          icon={<Medal size={28} weight="duotone" aria-hidden />}
          title="보유한 걸작 요리가 없습니다"
          message="연구실에서 요리를 만들다 걸작이 나오면 여기서 명장 요리로 만들 수 있습니다."
        />
      ) : (
        <ul className="space-y-2">
          {masterpieces.map(({ id, food, count }) => {
            const seafood = food.recipe.field === "seafood";
            const product = seafood ? LIFE_MAJOR_PRODUCTS.fishing : LIFE_MAJOR_PRODUCTS.farming;
            const heldProduct = seafood ? data.signature.products.catch : data.signature.products.crop;
            return (
              <li key={id} data-testid={`signature-${id}`} className={`${SURFACE_INSET} flex items-center gap-3 p-3`}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{food.name}</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    보유 {count}개 · {product.name} 1개 필요 · 보유 {heldProduct}
                  </p>
                </div>
                <Button
                  size="sm"
                  className="shrink-0"
                  disabled={busy || heldProduct < 1}
                  onClick={() => void mutate({ action: "signature", foodId: id })}
                >
                  명장 요리로
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
