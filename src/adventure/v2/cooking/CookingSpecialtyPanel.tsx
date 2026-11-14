"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/Button";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { useModalA11y } from "@/lib/useModalA11y";
import { COOKING_SPECIALTY_CHANGE_COOLDOWN_MS, cookingSpecialtyRank } from "./specialty";
import { COOKING_FIELD_NAMES, type CookingField } from "./types";
import { formatCookingChangeTime } from "./clientDisplay";
import type { CookingMutation, CookingResponse } from "./clientTypes";

const FIELDS = Object.keys(COOKING_FIELD_NAMES) as CookingField[];
const COOLDOWN_DAYS = COOKING_SPECIALTY_CHANGE_COOLDOWN_MS / 86_400_000;
const FIELD_BUTTON_CLASS = `${SURFACE_INSET} min-h-10 px-3 py-3 text-sm font-bold text-zinc-800 disabled:cursor-not-allowed disabled:text-zinc-400 dark:text-zinc-100 dark:disabled:text-zinc-500`;

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
  const specialtyRank = specialty ? cookingSpecialtyRank(specialty.xp) : null;
  const reserve = data.cooking.specialtyReserve ?? {};
  const changedAt = data.cooking.specialtyChangedAt;
  const nextChangeAt =
    changedAt === undefined ? null : changedAt + COOKING_SPECIALTY_CHANGE_COOLDOWN_MS;
  const coolingDown = nextChangeAt !== null && nextChangeAt > data.now;
  const pendingName = pendingField ? COOKING_FIELD_NAMES[pendingField] : "";
  const pendingReserve = pendingField ? reserve[pendingField] ?? 0 : 0;
  return (
    <>
      <section className={`${SURFACE_CARD} p-4`}>
        <h3 className="font-bold text-zinc-900 dark:text-zinc-100">
          주 전문 분야
        </h3>
        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
          요리 Lv 20과 숨은 레시피 10종 발견 후 한 분야를 고릅니다. 분야를
          바꾸면 {COOLDOWN_DAYS}일 동안 다시 바꿀 수 없습니다.
        </p>
        {specialty ? (
          <>
            <div className={`${SURFACE_INSET} mt-4 p-4`}>
              <div className="text-lg font-bold text-amber-800 dark:text-amber-200">
                {COOKING_FIELD_NAMES[specialty.field]} 전문 · 랭크{" "}
                {specialtyRank}
                {specialtyRank === 5 ? " (MAX)" : ""}
              </div>
              <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                전문 분야 음식 성능 +{specialtyRank}% · 숙련 XP{" "}
                {specialty.xp.toLocaleString()}
              </div>
              <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                이 보너스는 제작한 음식에 기록되어 거래 후에도 유지됩니다.
              </div>
            </div>
            <h4 className="mt-4 text-sm font-bold text-zinc-900 dark:text-zinc-100">
              분야 변경
            </h4>
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
              {coolingDown && nextChangeAt !== null
                ? `${formatCookingChangeTime(nextChangeAt)}부터 변경할 수 있습니다.`
                : "숙련은 분야마다 따로 남습니다. 분야를 바꾸면 고른 특화는 풀립니다."}
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-4">
              {FIELDS.filter((field) => field !== specialty.field).map((field) => (
                <button
                  key={field}
                  type="button"
                  disabled={coolingDown || busy}
                  aria-haspopup="dialog"
                  aria-label={`${COOKING_FIELD_NAMES[field]} · 숙련 ${(reserve[field] ?? 0).toLocaleString("ko-KR")}`}
                  onClick={() => setPendingField(field)}
                  className={FIELD_BUTTON_CLASS}
                >
                  {COOKING_FIELD_NAMES[field]}
                  <span className="mt-0.5 block text-xs font-normal tabular-nums text-zinc-600 dark:text-zinc-300">
                    숙련 {(reserve[field] ?? 0).toLocaleString("ko-KR")}
                  </span>
                </button>
              ))}
            </div>
          </>
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
                  className={FIELD_BUTTON_CLASS}
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
          title={
            specialty
              ? `${pendingName} 전문으로 바꿀까요?`
              : `${pendingName} 전문을 선택할까요?`
          }
          fieldName={pendingName}
          description={
            specialty
              ? `바꾸면 ${COOLDOWN_DAYS}일 동안 다시 바꿀 수 없습니다. ${COOKING_FIELD_NAMES[specialty.field]} 숙련 ${specialty.xp.toLocaleString("ko-KR")}은 그대로 남고, 고른 특화는 풀립니다. ${pendingName} 숙련은 ${
                  pendingReserve > 0
                    ? `${pendingReserve.toLocaleString("ko-KR")}에서 이어 쌓습니다.`
                    : "0부터 쌓습니다."
                }`
              : `나중에 바꿀 수 있지만, 바꾼 뒤에는 ${COOLDOWN_DAYS}일 동안 다시 바꿀 수 없습니다.`
          }
          confirmLabel={specialty ? `${pendingName} 전문으로 변경` : `${pendingName} 전문 선택`}
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
  title,
  fieldName,
  description,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  title: string;
  fieldName: string;
  description: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
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
          {title}
        </h2>
        <div className={`${SURFACE_INSET} mt-4 p-4 text-center`}>
          <strong className="text-lg text-amber-800 dark:text-amber-200">
            {fieldName} 전문
          </strong>
        </div>
        <p
          id="cooking-specialty-confirm-description"
          className="mt-3 text-sm leading-relaxed text-zinc-700 dark:text-zinc-200"
        >
          {description}
        </p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button size="md" onClick={onCancel}>
            취소
          </Button>
          <Button size="md" variant="primary" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
