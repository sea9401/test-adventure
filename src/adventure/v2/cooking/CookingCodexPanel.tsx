"use client";

import Image from "next/image";
import { Star } from "@phosphor-icons/react";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import { cookingEffectText } from "./food";
import { COOKING_FIELD_NAMES, COOKING_METHOD_NAMES } from "./types";
import type { CookingMutation, CookingResponse } from "./clientTypes";
import { cookingIngredientCount, cookingIngredientName } from "./clientDisplay";

export function CookingCodexPanel({ data, busy, mutate }: { data: CookingResponse; busy: boolean; mutate: CookingMutation }) {
  const known = new Map(data.knownRecipes.map((entry) => [entry.id, entry]));
  const first = new Map(data.firstDiscoveries.map((entry) => [entry.recipeId, entry]));
  return (
    <section className={`${SURFACE_CARD} p-4`}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="font-bold text-zinc-900 dark:text-zinc-100">요리 도감</h3>
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">개인 발견 {data.cooking.discoveredRecipeIds.length}/100 · 기본 6종은 경험치용으로 자동 습득합니다.</p>
        </div>
        <div className="text-xs text-zinc-500">전승 토큰 {data.cooking.legacy.tokens}개</div>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {data.recipes.map((recipe) => {
          const detail = known.get(recipe.id);
          const discovery = first.get(recipe.id);
          const favorite = data.cooking.favoriteRecipeIds.includes(recipe.id);
          return (
            <article key={recipe.id} className={`${SURFACE_INSET} p-3`}>
              <div className="flex gap-3">
                {detail ? <Image src={recipe.imageSrc} alt="" width={64} height={64} unoptimized className="h-16 w-16 shrink-0 object-contain" />
                  : <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md bg-zinc-200 text-2xl font-bold text-zinc-500 dark:bg-zinc-800">?</div>}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="font-bold text-zinc-900 dark:text-zinc-100">{detail ? recipe.name : "미발견 레시피"}</h4>
                    {detail ? <button type="button" aria-label={favorite ? "즐겨찾기 해제" : "즐겨찾기"} disabled={busy}
                      onClick={() => void mutate({ action: "favorite", recipeId: recipe.id })} className="text-amber-500"><Star size={18} weight={favorite ? "fill" : "regular"} /></button> : null}
                  </div>
                  <div className="text-xs text-zinc-500">
                    {detail
                      ? `${COOKING_FIELD_NAMES[recipe.field]} · ${COOKING_METHOD_NAMES[recipe.method]} · T${recipe.tier} · Lv ${recipe.requiredLevel}`
                      : "분야 · 조리법 · 등급 미확인"}
                  </div>
                  {detail ? <div className="mt-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">{cookingEffectText(recipe.effect)}</div> : <div className="mt-1 text-xs text-zinc-500">직접 연구해 조합을 밝혀내세요.</div>}
                </div>
              </div>
              {detail ? (
                <>
                  <div className="mt-2 text-xs text-zinc-700 dark:text-zinc-300">
                    {detail.ingredients.map((ingredient) => `${cookingIngredientName(data, ingredient.id)} ${ingredient.count}개 (보유 ${cookingIngredientCount(data, ingredient.id)})`).join(" · ")}
                  </div>
                  {discovery ? <div className="mt-1 text-[11px] font-semibold text-orange-700 dark:text-orange-300">원조: {discovery.actorName}{discovery.mine ? " · 내 레시피(+10%)" : ""}</div> : null}
                  <button type="button" disabled={busy || data.level < recipe.requiredLevel}
                    onClick={() => void mutate({ action: "craft", recipeId: recipe.id, quantity: 1 })}
                    className="mt-3 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">1개 조리</button>
                </>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
