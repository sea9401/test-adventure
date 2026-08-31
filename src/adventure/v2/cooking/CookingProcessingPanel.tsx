"use client";

import { useState } from "react";
import { DraftNumberInput } from "@/components/ui/DraftNumberInput";
import { PlumpGameIcon } from "@/components/icons/PlumpGameIcon";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import type { FarmItemInventory } from "../farm";
import type { CookingMutation, CookingResponse } from "./clientTypes";
import type { CookingPantryItem, CookingProcessingRecipe } from "./kitchen";

const MAX_COOKING_BATCH_QUANTITY = 100;
const QUANTITY_INPUT_CLASS = "h-8 w-16 rounded-md border border-zinc-300 bg-white px-2 text-center text-xs font-bold tabular-nums text-zinc-900 disabled:cursor-not-allowed disabled:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

function maxProcessingQuantity(
  recipe: CookingProcessingRecipe,
  farmItems: FarmItemInventory,
): number {
  const limits = Object.entries(recipe.farmIngredients).map(([itemId, count]) => {
    const required = Math.max(1, Math.floor(Number(count) || 0));
    const owned = Math.max(0, Math.floor(Number(farmItems[itemId as keyof FarmItemInventory]) || 0));
    return Math.floor(owned / required);
  });
  if (limits.length === 0) return 0;
  return Math.min(MAX_COOKING_BATCH_QUANTITY, ...limits);
}

function PantryPurchaseRow({
  item,
  owned,
  busy,
  mutate,
}: {
  item: CookingPantryItem;
  owned: number;
  busy: boolean;
  mutate: CookingMutation;
}) {
  const [quantity, setQuantity] = useState(1);
  const totalPrice = item.price * quantity;
  return (
    <div className={`${SURFACE_CARD} p-2 text-sm`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5 font-semibold text-zinc-900 dark:text-zinc-100">
            <PlumpGameIcon name={item.iconName} size={20} />
            <span>{item.name} · 보유 {owned}</span>
          </div>
          <div className="text-[11px] text-zinc-500">개당 {item.price.toLocaleString("ko-KR")}골드</div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <DraftNumberInput
            min={1}
            max={MAX_COOKING_BATCH_QUANTITY}
            value={quantity}
            onValueChange={setQuantity}
            disabled={busy}
            aria-label={`${item.name} 구매 수량`}
            className={QUANTITY_INPUT_CLASS}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => void mutate({ action: "buy_pantry", itemId: item.id, quantity })}
            className="rounded-md bg-amber-600 px-2 py-1.5 text-xs font-bold text-white disabled:opacity-50"
          >
            {quantity.toLocaleString("ko-KR")}개 · {totalPrice.toLocaleString("ko-KR")}골드 구매
          </button>
        </div>
      </div>
    </div>
  );
}

function ProcessingRecipeRow({
  recipe,
  data,
  busy,
  mutate,
}: {
  recipe: CookingProcessingRecipe;
  data: CookingResponse;
  busy: boolean;
  mutate: CookingMutation;
}) {
  const [quantity, setQuantity] = useState(1);
  const maxQuantity = maxProcessingQuantity(recipe, data.farmItems);
  const selectedQuantity = maxQuantity > 0 ? Math.min(quantity, maxQuantity) : 1;
  const disabled = busy || maxQuantity < 1;
  const ingredientText = Object.entries(recipe.farmIngredients)
    .map(([id, count]) => `${data.farmItemDefinitions[id]?.name ?? id} ${Number(count) * selectedQuantity}개`)
    .join(" · ");

  return (
    <div className={`${SURFACE_CARD} p-2 text-sm`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5 font-semibold text-zinc-900 dark:text-zinc-100">
            <PlumpGameIcon name={recipe.iconName} size={20} />
            <span>{recipe.name} · 보유 {data.kitchenItems[recipe.outputId] ?? 0}</span>
          </div>
          <div className="text-[11px] text-zinc-500">{ingredientText}</div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <DraftNumberInput
            min={1}
            max={Math.max(1, maxQuantity)}
            value={selectedQuantity}
            onValueChange={setQuantity}
            disabled={disabled}
            aria-label={`${recipe.name} 가공 수량`}
            className={QUANTITY_INPUT_CLASS}
          />
          <button
            type="button"
            disabled={disabled}
            onClick={() => void mutate({ action: "process", itemId: recipe.outputId, quantity: selectedQuantity })}
            className="rounded-md bg-emerald-600 px-2 py-1.5 text-xs font-bold text-white disabled:opacity-50"
          >
            {maxQuantity > 0 ? `${selectedQuantity.toLocaleString("ko-KR")}개 가공` : "재료 부족"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function CookingProcessingPanel({ data, busy, mutate }: { data: CookingResponse; busy: boolean; mutate: CookingMutation }) {
  return <section className={`${SURFACE_CARD} p-4`}>
    <h3 className="font-bold text-zinc-900 dark:text-zinc-100">재료 가공</h3>
    <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">기본 조미료는 골드로 사고, 중간 재료는 농장·목장 재료를 가공해 만듭니다.</p>
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <div className={`${SURFACE_INSET} p-3`}>
        <h4 className="font-bold">주방 상점</h4>
        <div className="mt-2 space-y-2">
          {data.pantryItems.map((item) => (
            <PantryPurchaseRow
              key={item.id}
              item={item}
              owned={data.kitchenItems[item.id] ?? 0}
              busy={busy}
              mutate={mutate}
            />
          ))}
        </div>
      </div>
      <div className={`${SURFACE_INSET} p-3`}>
        <h4 className="font-bold">주방 가공</h4>
        <div className="mt-2 space-y-2">
          {data.processingRecipes.map((recipe) => (
            <ProcessingRecipeRow
              key={recipe.outputId}
              recipe={recipe}
              data={data}
              busy={busy}
              mutate={mutate}
            />
          ))}
        </div>
      </div>
    </div>
  </section>;
}
