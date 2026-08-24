"use client";

import { useMemo } from "react";
import { CheckCircle, Circle, CookingPot, Trophy } from "@phosphor-icons/react";
import { Card } from "@/components/ui/Card";
import { Pagination } from "@/components/ui/Pagination";
import { SURFACE_INSET } from "@/components/ui/surfaces";
import { usePagination } from "@/lib/usePagination";
import {
  COOKING_CODEX_MILESTONES,
  COOKING_PUBLIC_RECIPES,
} from "./cooking/catalog";
import { cookingEffectText } from "./cooking/food";

const COOKING_CODEX_PAGE_SIZE = 20;

export function CookingCodexPanel({
  discoveredIds,
}: {
  discoveredIds: readonly string[];
}) {
  const discovered = useMemo(() => new Set(discoveredIds), [discoveredIds]);
  const discoveredCount = COOKING_PUBLIC_RECIPES.filter((recipe) =>
    discovered.has(recipe.id),
  ).length;
  const progressPct =
    COOKING_PUBLIC_RECIPES.length > 0
      ? Math.min(100, (discoveredCount / COOKING_PUBLIC_RECIPES.length) * 100)
      : 0;
  const sortedRecipes = useMemo(
    () => [
      ...COOKING_PUBLIC_RECIPES.filter((recipe) => discovered.has(recipe.id)),
      ...COOKING_PUBLIC_RECIPES.filter((recipe) => !discovered.has(recipe.id)),
    ],
    [discovered],
  );
  const pager = usePagination(sortedRecipes, COOKING_CODEX_PAGE_SIZE);

  return (
    <div className="space-y-3">
      <Card padding="md">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <CookingPot
              size={24}
              weight="duotone"
              className="shrink-0 text-amber-600 dark:text-amber-400"
              aria-hidden
            />
            <div>
              <h2 className="text-sm font-bold">요리 완성 도감</h2>
              <p className="mt-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
                주방 연구에서 레시피를 발견하면 자동으로 등록됩니다. 등록 수는 요리법 발견
                업적에 반영되며, 별도의 능력치나 SP를 직접 지급하지는 않습니다.
              </p>
            </div>
          </div>
          <span className="shrink-0 text-sm font-bold tabular-nums text-amber-700 dark:text-amber-300">
            {discoveredCount} / {COOKING_PUBLIC_RECIPES.length}
          </span>
        </div>
        <div
          className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
          role="progressbar"
          aria-label="요리 완성 도감 진행도"
          aria-valuemin={0}
          aria-valuemax={COOKING_PUBLIC_RECIPES.length}
          aria-valuenow={discoveredCount}
        >
          <div
            className="h-full rounded-full bg-amber-500 transition-[width]"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </Card>

      <Card padding="md">
        <div className="mb-3 flex items-center gap-2">
          <Trophy
            size={20}
            weight="duotone"
            className="text-amber-600 dark:text-amber-400"
            aria-hidden
          />
          <div>
            <h2 className="text-sm font-bold">요리법 발견 업적</h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              퀘스트의 업적 → 요리에서도 같은 진행도를 확인할 수 있습니다.
            </p>
          </div>
        </div>
        <ul className="grid gap-2 sm:grid-cols-2">
          {COOKING_CODEX_MILESTONES.map((milestone) => {
            const complete = discoveredCount >= milestone.goal;
            return (
              <li
                key={`${milestone.goal}:${milestone.title}`}
                className={`${SURFACE_INSET} flex items-center gap-2.5 px-3 py-2`}
              >
                {complete ? (
                  <CheckCircle
                    size={19}
                    weight="fill"
                    className="shrink-0 text-emerald-600 dark:text-emerald-400"
                    aria-hidden
                  />
                ) : (
                  <Circle
                    size={19}
                    className="shrink-0 text-zinc-400"
                    aria-hidden
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold">
                    {milestone.title}
                  </p>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    {Math.min(discoveredCount, milestone.goal)}/{milestone.goal}종
                  </p>
                </div>
                <span className="shrink-0 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                  +{milestone.points}점
                </span>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card padding="none" className="overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
          <h2 className="text-sm font-bold">레시피 목록</h2>
          <span className="text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">
            발견 {discoveredCount} · 미발견{" "}
            {COOKING_PUBLIC_RECIPES.length - discoveredCount}
          </span>
        </div>
        <ul
          aria-label="요리 레시피 목록"
          className="divide-y divide-zinc-200 dark:divide-zinc-800"
        >
          {pager.pageItems.map((recipe) => {
            const found = discovered.has(recipe.id);
            return (
              <li
                key={recipe.id}
                className="flex items-start gap-2.5 px-3 py-2.5"
              >
                <span className="text-xl" aria-hidden>
                  {recipe.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-semibold">
                      {found ? recipe.name : "미발견 레시피"}
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                        found
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                          : "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                      }`}
                    >
                      {found ? "도감 등록" : "미등록"}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
                    {found ? recipe.description : "주방 연구에서 직접 발견해야 합니다."}
                  </p>
                  <p className="mt-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                    {found ? `효과 · ${cookingEffectText(recipe.effect)}` : "효과 미확인"}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
        <Pagination
          page={pager.page}
          pageCount={pager.pageCount}
          setPage={pager.setPage}
          className="border-t border-zinc-200 px-3 pb-3 dark:border-zinc-800"
        />
      </Card>
    </div>
  );
}
