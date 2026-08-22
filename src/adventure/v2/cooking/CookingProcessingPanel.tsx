"use client";

import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import type { CookingMutation, CookingResponse } from "./clientTypes";

export function CookingProcessingPanel({ data, busy, mutate }: { data: CookingResponse; busy: boolean; mutate: CookingMutation }) {
  return <section className={`${SURFACE_CARD} p-4`}>
    <h3 className="font-bold text-zinc-900 dark:text-zinc-100">재료 가공</h3>
    <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">기본 조미료는 골드로 사고, 중간 재료는 농장·목장 재료를 가공해 만듭니다.</p>
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <div className={`${SURFACE_INSET} p-3`}><h4 className="font-bold">주방 상점</h4><div className="mt-2 space-y-2">{data.pantryItems.map((item) => <div key={item.id} className="flex items-center justify-between rounded-md border border-zinc-300 bg-white p-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"><span>{item.icon} {item.name} · 보유 {data.kitchenItems[item.id] ?? 0}</span><button type="button" disabled={busy} onClick={() => void mutate({ action: "buy_pantry", itemId: item.id, quantity: 1 })} className="rounded bg-amber-600 px-2 py-1 text-xs font-bold text-white disabled:opacity-50">{item.price.toLocaleString()}골드</button></div>)}</div></div>
      <div className={`${SURFACE_INSET} p-3`}><h4 className="font-bold">주방 가공</h4><div className="mt-2 space-y-2">{data.processingRecipes.map((recipe) => <div key={recipe.outputId} className="flex items-center justify-between gap-2 rounded-md border border-zinc-300 bg-white p-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"><span>{recipe.icon} {recipe.name} · 보유 {data.kitchenItems[recipe.outputId] ?? 0}<span className="block text-[11px] text-zinc-500">{Object.entries(recipe.farmIngredients).map(([id, count]) => `${data.farmItemDefinitions[id]?.name ?? id} ${count}개`).join(" · ")}</span></span><button type="button" disabled={busy} onClick={() => void mutate({ action: "process", itemId: recipe.outputId, quantity: 1 })} className="rounded bg-emerald-600 px-2 py-1 text-xs font-bold text-white disabled:opacity-50">1개 가공</button></div>)}</div></div>
    </div>
  </section>;
}
