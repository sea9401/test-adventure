"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/Button";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { useModalA11y } from "@/lib/useModalA11y";
import { cookingSpecialtyRank } from "./state";
import { COOKING_FIELD_NAMES, type CookingField } from "./types";
import type { CookingMutation, CookingResponse } from "./clientTypes";

const FIELDS = Object.keys(COOKING_FIELD_NAMES) as CookingField[];

export function CookingSpecialtyPanel({
  data,
  busy,
  mutate,
}: {
  data: CookingResponse;
  busy: boolean;
  mutate: CookingMutation;
}) {
  const [pendingField, setPendingField] = useState<CookingField | null>(null);
  const hiddenCount = data.knownRecipes.filter(
    (recipe) => recipe.discovery !== "basic",
  ).length;
  const eligible = data.level >= 20 && hiddenCount >= 10;
  const specialty = data.cooking.specialty;
  return (
    <>
      <section className={`${SURFACE_CARD} p-4`}>
        <h3 className="font-bold text-zinc-900 dark:text-zinc-100">
          주 전문 분야
        </h3>
        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
          요리 Lv 20과 숨은 레시피 10종 발견 후 한 분야를 영구 선택합니다. 한
          번 정하면 변경하거나 초기화할 수 없습니다.
        </p>
        {specialty ? (
          <div className={`${SURFACE_INSET} mt-4 p-4`}>
            <div className="text-lg font-bold text-amber-800 dark:text-amber-200">
              {COOKING_FIELD_NAMES[specialty.field]} 전문 · 랭크{" "}
              {cookingSpecialtyRank(specialty.xp)}
            </div>
            <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
              전문 분야 음식 성능 +{cookingSpecialtyRank(specialty.xp)}% · 숙련 XP{" "}
              {specialty.xp.toLocaleString()}
            </div>
            <div className="mt-2 text-xs text-zinc-500">
              이 보너스는 제작한 음식에 기록되어 거래 후에도 유지됩니다.
            </div>
          </div>
        ) : (
          <>
            <div className="mt-3 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              현재 조건: 요리 Lv {data.level}/20 · 숨은 발견 {hiddenCount}/10
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {FIELDS.map((field) => (
                <button
                  key={field}
                  type="button"
                  disabled={!eligible || busy}
                  aria-haspopup="dialog"
                  onClick={() => setPendingField(field)}
                  className={`${SURFACE_INSET} px-3 py-4 text-sm font-bold text-zinc-800 disabled:cursor-not-allowed disabled:text-zinc-400 dark:text-zinc-100`}
                >
                  {COOKING_FIELD_NAMES[field]}
                </button>
              ))}
            </div>
          </>
        )}
      </section>
      {pendingField ? (
        <CookingSpecialtyConfirmDialog
          field={pendingField}
          onCancel={() => setPendingField(null)}
          onConfirm={() => {
            const field = pendingField;
            setPendingField(null);
            void mutate({ action: "choose_specialty", field });
          }}
        />
      ) : null}
    </>
  );
}

function CookingSpecialtyConfirmDialog({
  field,
  onCancel,
  onConfirm,
}: {
  field: CookingField;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const fieldName = COOKING_FIELD_NAMES[field];
  useEscapeKey(onCancel);
  useModalA11y(panelRef);

  return createPortal(
    <div
      className="ui-modal-reveal fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onCancel();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cooking-specialty-confirm-title"
        aria-describedby="cooking-specialty-confirm-description"
        className={`${SURFACE_CARD} ui-modal-panel w-full max-w-md p-5 shadow-2xl`}
      >
        <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
          주 전문 분야
        </p>
        <h2
          id="cooking-specialty-confirm-title"
          className="mt-1 text-lg font-bold text-zinc-900 dark:text-zinc-100"
        >
          {fieldName} 전문을 선택할까요?
        </h2>
        <div className={`${SURFACE_INSET} mt-4 p-4 text-center`}>
          <strong className="text-lg text-amber-800 dark:text-amber-200">
            {fieldName} 전문
          </strong>
        </div>
        <p
          id="cooking-specialty-confirm-description"
          className="mt-3 text-sm font-medium leading-relaxed text-rose-700 dark:text-rose-300"
        >
          선택 후에는 전문 분야를 변경하거나 초기화할 수 없습니다.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button size="md" onClick={onCancel}>
            취소
          </Button>
          <Button size="md" variant="warning" onClick={onConfirm}>
            {fieldName} 영구 선택
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
