"use client";

import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import { cookingSpecialtyRank } from "./state";
import { COOKING_FIELD_NAMES, type CookingField } from "./types";
import type { CookingMutation, CookingResponse } from "./clientTypes";

const FIELDS = Object.keys(COOKING_FIELD_NAMES) as CookingField[];

export function CookingSpecialtyPanel({ data, busy, mutate }: { data: CookingResponse; busy: boolean; mutate: CookingMutation }) {
  const hiddenCount = data.cooking.discoveredRecipeIds.filter((id) => data.recipes.find((entry) => entry.id === id)?.discovery !== "basic").length;
  const eligible = data.level >= 20 && hiddenCount >= 10;
  const specialty = data.cooking.specialty;
  return (
    <section className={`${SURFACE_CARD} p-4`}>
      <h3 className="font-bold text-zinc-900 dark:text-zinc-100">주 전문 분야</h3>
      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">요리 Lv 20과 숨은 레시피 10종 발견 후 한 분야를 영구 선택합니다. 한 번 정하면 변경하거나 초기화할 수 없습니다.</p>
      {specialty ? (
        <div className={`${SURFACE_INSET} mt-4 p-4`}>
          <div className="text-lg font-bold text-amber-800 dark:text-amber-200">{COOKING_FIELD_NAMES[specialty.field]} 전문 · 랭크 {cookingSpecialtyRank(specialty.xp)}</div>
          <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">전문 분야 음식 성능 +{cookingSpecialtyRank(specialty.xp)}% · 숙련 XP {specialty.xp.toLocaleString()}</div>
          <div className="mt-2 text-xs text-zinc-500">이 보너스는 제작한 음식에 기록되어 거래 후에도 유지됩니다.</div>
        </div>
      ) : (
        <>
          <div className="mt-3 text-xs font-semibold text-zinc-600 dark:text-zinc-300">현재 조건: 요리 Lv {data.level}/20 · 숨은 발견 {hiddenCount}/10</div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {FIELDS.map((field) => (
              <button key={field} type="button" disabled={!eligible || busy}
                onClick={() => {
                  if (window.confirm(`${COOKING_FIELD_NAMES[field]} 분야를 영구 선택합니다. 이후 변경할 수 없습니다.`)) void mutate({ action: "choose_specialty", field });
                }}
                className={`${SURFACE_INSET} px-3 py-4 text-sm font-bold text-zinc-800 disabled:cursor-not-allowed disabled:text-zinc-400 dark:text-zinc-100`}>
                {COOKING_FIELD_NAMES[field]}
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
