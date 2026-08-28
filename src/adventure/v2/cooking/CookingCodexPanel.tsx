"use client";

import Image from "next/image";
import { Star } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { Pagination } from "@/components/ui/Pagination";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import { usePagination } from "@/lib/usePagination";
import { cookingEffectText } from "./food";
import { COOKING_FIELD_NAMES, COOKING_METHOD_NAMES } from "./types";
import type { CookingMutation, CookingResponse } from "./clientTypes";
import { cookingIngredientCount, cookingIngredientName } from "./clientDisplay";

const COOKING_CODEX_PAGE_SIZE = 12;
type CookingCodexSort = "discovered" | "name" | "level" | "tier";

function normalizeCodexSearch(value: string): string {
  return value.trim().toLocaleLowerCase("ko-KR");
}

export function CookingCodexPanel({ data, busy, mutate }: { data: CookingResponse; busy: boolean; mutate: CookingMutation }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<CookingCodexSort>("discovered");
  const [usePrepSet, setUsePrepSet] = useState(false);
  const prepSetEnabled = usePrepSet && data.cookingPrepSets > 0;
  const visibleRecipes = useMemo(() => {
    const normalizedQuery = normalizeCodexSearch(query);
    const favorites = new Set(data.cooking.favoriteRecipeIds);
    const entries = Array.from({ length: data.recipeTotal }, (_, index) => ({
      recipe: data.knownRecipes[index] ?? null,
      index,
    }));
    return entries
      .filter(({ recipe }) => {
        if (!normalizedQuery) return true;
        if (!recipe) return "미발견 레시피".includes(normalizedQuery);
        const searchText = [
          recipe.name,
          COOKING_FIELD_NAMES[recipe.field],
          COOKING_METHOD_NAMES[recipe.method],
          `T${recipe.tier}`,
          `Lv ${recipe.requiredLevel}`,
          cookingEffectText(recipe.effect),
          ...recipe.ingredients.map((ingredient) =>
            cookingIngredientName(data, ingredient.id),
          ),
        ]
          .join(" ")
          .toLocaleLowerCase("ko-KR");
        return searchText.includes(normalizedQuery);
      })
      .sort((left, right) => {
        const discoveredOrder = Number(Boolean(right.recipe)) - Number(Boolean(left.recipe));
        if (discoveredOrder !== 0) return discoveredOrder;
        if (!left.recipe || !right.recipe) return left.index - right.index;
        if (sort === "discovered") {
          const favoriteOrder = Number(favorites.has(right.recipe.id)) - Number(favorites.has(left.recipe.id));
          return favoriteOrder || left.index - right.index;
        }
        if (sort === "name") {
          return left.recipe.name.localeCompare(right.recipe.name, "ko-KR") || left.index - right.index;
        }
        if (sort === "level") {
          return left.recipe.requiredLevel - right.recipe.requiredLevel
            || left.recipe.tier - right.recipe.tier
            || left.recipe.name.localeCompare(right.recipe.name, "ko-KR");
        }
        return left.recipe.tier - right.recipe.tier
          || left.recipe.requiredLevel - right.recipe.requiredLevel
          || left.recipe.name.localeCompare(right.recipe.name, "ko-KR");
      });
  }, [data, query, sort]);
  const pager = usePagination(
    visibleRecipes,
    COOKING_CODEX_PAGE_SIZE,
    `${query}\u0000${sort}`,
  );
  return (
    <section className={`${SURFACE_CARD} p-4`}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="font-bold text-zinc-900 dark:text-zinc-100">요리 도감</h3>
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">개인 발견 {data.knownRecipes.length}/{data.recipeTotal} · 기본 6종은 경험치용으로 자동 습득합니다.</p>
        </div>
        <div className="text-xs text-zinc-500">전승 토큰 {data.cooking.legacy.tokens}개</div>
      </div>
      <div className={`${SURFACE_INSET} mt-4 grid gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_10rem]`}>
        <label className="grid gap-1 text-xs font-semibold text-zinc-700 dark:text-zinc-200">
          <span>레시피 검색</span>
          <input
            type="search"
            aria-label="요리 도감 검색"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="요리명·재료·효과 검색"
            className="min-h-11 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-normal text-zinc-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:ring-amber-900"
          />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-zinc-700 dark:text-zinc-200">
          <span>정렬</span>
          <select
            aria-label="요리 도감 정렬"
            value={sort}
            onChange={(event) => setSort(event.target.value as CookingCodexSort)}
            className="min-h-11 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-normal text-zinc-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:ring-amber-900"
          >
            <option value="discovered">발견 우선</option>
            <option value="name">이름순</option>
            <option value="level">필요 레벨순</option>
            <option value="tier">등급순</option>
          </select>
        </label>
        <div aria-live="polite" className="text-xs text-zinc-500 sm:col-span-2">
          검색 결과 {visibleRecipes.length.toLocaleString("ko-KR")}개
        </div>
        <label className="flex min-h-11 items-center gap-2 text-xs font-semibold text-zinc-700 dark:text-zinc-200 sm:col-span-2">
          <input
            type="checkbox"
            checked={prepSetEnabled}
            disabled={busy || data.cookingPrepSets <= 0}
            onChange={(event) => setUsePrepSet(event.target.checked)}
            className="h-4 w-4 accent-amber-600"
          />
          <span>
            요리 준비 세트 사용 · 조리 수량만큼 소모, 걸작 확률 +8%p
            {` (보유 ${data.cookingPrepSets.toLocaleString("ko-KR")}개)`}
          </span>
        </label>
      </div>
      {visibleRecipes.length > 0 ? <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {pager.pageItems.map(({ recipe, index }) => {
          const favorite = recipe ? data.cooking.favoriteRecipeIds.includes(recipe.id) : false;
          return (
            <article key={recipe?.id ?? `unknown:${index}`} className={`${SURFACE_INSET} p-3`}>
              <div className="flex gap-3">
                {recipe ? <Image src={recipe.imageSrc} alt="" width={64} height={64} unoptimized className="h-16 w-16 shrink-0 object-contain" />
                  : <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md bg-zinc-200 text-2xl font-bold text-zinc-500 dark:bg-zinc-800">?</div>}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="font-bold text-zinc-900 dark:text-zinc-100">{recipe ? recipe.name : "미발견 레시피"}</h4>
                    {recipe ? <button type="button" aria-label={favorite ? "즐겨찾기 해제" : "즐겨찾기"} disabled={busy}
                      onClick={() => void mutate({ action: "favorite", recipeId: recipe.id })} className="text-amber-500"><Star size={18} weight={favorite ? "fill" : "regular"} /></button> : null}
                  </div>
                  <div className="text-xs text-zinc-500">
                    {recipe
                      ? `${COOKING_FIELD_NAMES[recipe.field]} · ${COOKING_METHOD_NAMES[recipe.method]} · T${recipe.tier} · Lv ${recipe.requiredLevel}`
                      : "분야 · 조리법 · 등급 미확인"}
                  </div>
                  {recipe ? <div className="mt-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">{cookingEffectText(recipe.effect)}</div> : <div className="mt-1 text-xs text-zinc-500">직접 연구해 조합을 밝혀내세요.</div>}
                  {recipe ? <div className="mt-1 text-xs font-semibold text-amber-700 dark:text-amber-300">기본 조리 XP +{recipe.craftXp.toLocaleString("ko-KR")}</div> : null}
                </div>
              </div>
              {recipe ? (
                <>
                  <div className="mt-2 text-xs text-zinc-700 dark:text-zinc-300">
                    {recipe.ingredients.map((ingredient) => `${cookingIngredientName(data, ingredient.id)} ${ingredient.count}개 (보유 ${cookingIngredientCount(data, ingredient.id)})`).join(" · ")}
                  </div>
                  <button type="button" disabled={busy || data.level < recipe.requiredLevel}
                    onClick={() => void mutate({ action: "craft", recipeId: recipe.id, quantity: 1, usePrepSet: prepSetEnabled })}
                    className="mt-3 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">1개 조리</button>
                </>
              ) : null}
            </article>
          );
        })}
      </div> : (
        <div className={`${SURFACE_INSET} mt-4 p-6 text-center text-sm text-zinc-600 dark:text-zinc-300`}>
          검색 조건에 맞는 레시피가 없습니다.
        </div>
      )}
      {visibleRecipes.length > 0 ? (
        <Pagination
          page={pager.page}
          pageCount={pager.pageCount}
          setPage={pager.setPage}
        />
      ) : null}
    </section>
  );
}
