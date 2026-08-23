"use client";

import { useMemo, useState } from "react";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import { COOKING_METHOD_NAMES, COOKING_METHOD_UNLOCK_LEVEL, type CookingIngredientId, type CookingMethod } from "./types";
import type { CookingMutation, CookingResponse } from "./clientTypes";
import { cookingIngredientCount, cookingIngredientName, cookingResearchIngredients } from "./clientDisplay";

const RESEARCH_TIME_FORMAT = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function researchAttemptKey(
  method: CookingMethod,
  ingredientIds: readonly CookingIngredientId[],
): string {
  return `${method}:${[...ingredientIds].sort().join("|")}`;
}

export function CookingResearchPanel({ data, busy, mutate }: {
  data: CookingResponse;
  busy: boolean;
  mutate: CookingMutation;
}) {
  const availableMethods = (Object.keys(COOKING_METHOD_NAMES) as CookingMethod[])
    .filter((method) => data.level >= COOKING_METHOD_UNLOCK_LEVEL[method]);
  const [method, setMethod] = useState<CookingMethod>(availableMethods[0] ?? "grill");
  const [selected, setSelected] = useState<CookingIngredientId[]>([]);
  const maxSlots = data.level >= 35 ? 5 : data.level >= 20 ? 4 : data.level >= 10 ? 3 : 2;
  const ingredients = useMemo(() => cookingResearchIngredients(data), [data]);
  const failedAttemptKeys = useMemo(
    () => new Set(data.failedResearches.map((entry) =>
      researchAttemptKey(entry.method, entry.ingredientIds))),
    [data.failedResearches],
  );
  const duplicateFailure = selected.length >= 2 && failedAttemptKeys.has(
    researchAttemptKey(method, selected),
  );
  const [previousIngredients, setPreviousIngredients] = useState(ingredients);
  if (ingredients !== previousIngredients) {
    const available = new Set(ingredients);
    setPreviousIngredients(ingredients);
    setSelected((current) => {
      const next = current.filter((id) => available.has(id));
      return next.length === current.length ? current : next;
    });
  }
  const toggle = (id: CookingIngredientId) => {
    setSelected((current) => current.includes(id)
      ? current.filter((entry) => entry !== id)
      : current.length < maxSlots ? [...current, id] : current);
  };

  return (
    <section className={`${SURFACE_CARD} p-4`}>
      <h3 className="font-bold text-zinc-900 dark:text-zinc-100">레시피 연구</h3>
      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
        조리법과 서로 다른 재료 2~{maxSlots}개를 골라 직접 시험합니다. 정답 조합과 힌트는 공개되지 않습니다.
      </p>
      <div className="mt-4 grid gap-4 lg:grid-cols-[220px_1fr]">
        <div className={`${SURFACE_INSET} p-3`}>
          <div className="mb-2 text-xs font-semibold text-zinc-700 dark:text-zinc-200">조리법</div>
          <div className="grid grid-cols-2 gap-1.5">
            {availableMethods.map((entry) => (
              <button key={entry} type="button" onClick={() => setMethod(entry)}
                className={`rounded-md border px-2 py-2 text-xs font-semibold ${method === entry ? "border-amber-500 bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100" : "border-zinc-300 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"}`}>
                {COOKING_METHOD_NAMES[entry]}
              </button>
            ))}
          </div>
          <div className="mt-3 text-xs text-zinc-500">선택 {selected.length}/{maxSlots}</div>
          <button type="button" disabled={busy || selected.length < 2 || duplicateFailure}
            onClick={() => {
              if (!duplicateFailure) {
                void mutate({ action: "research", method, ingredientIds: selected });
              }
            }}
            className="mt-2 w-full rounded-md bg-amber-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">
            {busy ? "연구 중…" : duplicateFailure ? "이미 실패한 조합" : "이 조합 연구"}
          </button>
          {duplicateFailure ? (
            <div role="status" className="mt-2 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
              이미 실패한 조합입니다. 재료는 소비되지 않습니다.
            </div>
          ) : (
            <div className="mt-2 text-[11px] text-zinc-500">오답은 각 재료 1개를 소비하며, 같은 오답은 다시 소비되지 않습니다.</div>
          )}
        </div>
        <div className={`${SURFACE_INSET} p-3`}>
          <div className="mb-2 text-xs font-semibold text-zinc-700 dark:text-zinc-200">보유 재료</div>
          {ingredients.length > 0 ? (
            <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
              {ingredients.map((id) => {
                const active = selected.includes(id);
                return (
                  <button key={id} type="button" aria-pressed={active} onClick={() => toggle(id)}
                    className={`rounded-md border px-2.5 py-2 text-left text-xs ${active ? "border-amber-500 bg-amber-100 text-amber-950 dark:bg-amber-950 dark:text-amber-100" : "border-zinc-300 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"}`}>
                    <span className="font-semibold">{cookingIngredientName(data, id)}</span>
                    <span className="ml-1 text-zinc-500">×{cookingIngredientCount(data, id)}</span>
                  </button>
                );
              })}
            </div>
          ) : <div className="py-8 text-center text-sm text-zinc-500">연구에 쓸 재료가 없습니다.</div>}
        </div>
      </div>
      <section
        aria-labelledby="cooking-research-history-title"
        className={`${SURFACE_INSET} mt-4 p-3`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4
            id="cooking-research-history-title"
            className="text-sm font-bold text-zinc-900 dark:text-zinc-100"
          >
            최근 실패 기록
          </h4>
          <span className="text-[11px] text-zinc-500">
            최근 {data.failedResearches.length}개 · 최대 100개
          </span>
        </div>
        {data.failedResearches.length > 0 ? (
          <ul className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
            {data.failedResearches.map((entry) => (
              <li
                key={`${researchAttemptKey(entry.method, entry.ingredientIds)}:${entry.createdAt}`}
                className={`${SURFACE_CARD} p-3 text-xs`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong>{COOKING_METHOD_NAMES[entry.method]}</strong>
                  <time
                    dateTime={new Date(entry.createdAt).toISOString()}
                    className="text-[11px] text-zinc-500"
                  >
                    {RESEARCH_TIME_FORMAT.format(entry.createdAt)}
                  </time>
                </div>
                <p className="mt-1 text-zinc-700 dark:text-zinc-300">
                  {entry.ingredientIds.map((id) => cookingIngredientName(data, id)).join(" · ")}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-xs text-zinc-500">
            아직 실패 기록이 없습니다. 새로운 조합을 연구해 보세요.
          </p>
        )}
        <p className="mt-3 text-[11px] text-zinc-500">
          성공한 조합은 요리 도감에서 다시 확인할 수 있습니다.
        </p>
      </section>
    </section>
  );
}
