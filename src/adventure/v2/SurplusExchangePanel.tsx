"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "@phosphor-icons/react";
import {
  FARM_CROP_LIST,
  type FarmItemId,
  type FarmItemInventory,
} from "./farm";
import {
  COOKING_SURPLUS_BATCH_SIZE,
  COOKING_SURPLUS_DAILY_LIMIT,
} from "./cookingSurplus";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { useModalA11y } from "@/lib/useModalA11y";
import { FarmItemIcon } from "./FarmItemIcon";

type PendingMaxExchange = {
  itemId: FarmItemId;
  itemName: string;
  owned: number;
  batches: number;
};

export function SurplusCropLabel({
  itemId,
  itemName,
  owned,
}: {
  itemId: FarmItemId;
  itemName: string;
  owned: number;
}) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <FarmItemIcon itemId={itemId} className="h-8 w-8" />
      <span>
        {itemName} <strong>{owned}</strong>개
      </span>
    </span>
  );
}

export function SurplusExchangePanel({
  farmItems,
  surplusTrades,
  busy,
  onExchange,
}: {
  farmItems: FarmItemInventory;
  surplusTrades: number;
  busy: string | null;
  onExchange: (itemId: string, batches: number) => void;
}) {
  const [pendingMax, setPendingMax] = useState<PendingMaxExchange | null>(null);
  const remaining = Math.max(
    0,
    COOKING_SURPLUS_DAILY_LIMIT - surplusTrades,
  );

  return (
    <section className={`${SURFACE_CARD} p-4`}>
      <h3 className="font-bold text-zinc-900 dark:text-zinc-100">
        일반 작물 떨이 교환
      </h3>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        1회당 일반 작물 {COOKING_SURPLUS_BATCH_SIZE}개를 농장 증표 1개로
        교환합니다. 오늘 남은 횟수 {remaining}회.
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {FARM_CROP_LIST.map((crop) => {
          const owned = farmItems[crop.itemId] ?? 0;
          const possible = Math.min(
            remaining,
            Math.floor(owned / COOKING_SURPLUS_BATCH_SIZE),
          );
          const rowBusy = busy === `surplus:${crop.itemId}`;
          return (
            <div
              key={crop.itemId}
              className={`${SURFACE_INSET} flex flex-col gap-2 p-2.5 text-sm`}
            >
              <div className="flex items-center justify-between gap-2">
                <SurplusCropLabel
                  itemId={crop.itemId}
                  itemName={crop.itemName}
                  owned={owned}
                />
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  disabled={possible < 1 || busy != null}
                  onClick={() => onExchange(crop.itemId, 1)}
                  className="rounded-md border border-emerald-600 bg-emerald-600 px-2 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-300 disabled:text-zinc-500 dark:disabled:border-zinc-700 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-500"
                >
                  {rowBusy ? "교환 중…" : `1회 · ${COOKING_SURPLUS_BATCH_SIZE}개`}
                </button>
                {possible > 1 ? (
                  <button
                    type="button"
                    disabled={busy != null}
                    onClick={() =>
                      setPendingMax({
                        itemId: crop.itemId,
                        itemName: crop.itemName,
                        owned,
                        batches: possible,
                      })
                    }
                    aria-haspopup="dialog"
                    className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                  >
                    최대 {possible}회 · {possible * COOKING_SURPLUS_BATCH_SIZE}개
                  </button>
                ) : (
                  <span
                    className="flex items-center justify-center text-[11px] text-zinc-400 dark:text-zinc-500"
                    aria-hidden="true"
                  >
                    최대 교환 없음
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {pendingMax && (
        <SurplusMaxExchangeDialog
          pending={pendingMax}
          onClose={() => setPendingMax(null)}
          onConfirm={() => {
            onExchange(pendingMax.itemId, pendingMax.batches);
            setPendingMax(null);
          }}
        />
      )}
    </section>
  );
}

function SurplusMaxExchangeDialog({
  pending,
  onClose,
  onConfirm,
}: {
  pending: PendingMaxExchange;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useEscapeKey(onClose);
  useModalA11y(panelRef);
  const quantity = pending.batches * COOKING_SURPLUS_BATCH_SIZE;

  return createPortal(
    <div
      className="ui-modal-reveal fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center sm:p-5"
      onMouseDown={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="surplus-max-exchange-title"
        className={`${SURFACE_CARD} ui-modal-panel w-full max-w-md overflow-hidden`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-start gap-3 border-b border-zinc-200 p-4 dark:border-zinc-700">
          <div className="min-w-0 flex-1">
            <h2
              id="surplus-max-exchange-title"
              className="text-base font-semibold text-zinc-900 dark:text-zinc-100"
            >
              최대 수량으로 교환할까요?
            </h2>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              여러 회차를 한꺼번에 교환합니다. 수량을 다시 확인해 주세요.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="최대 교환 취소"
            className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          >
            <X size={19} aria-hidden />
          </button>
        </header>

        <div className="p-4">
          <div className={`${SURFACE_INSET} grid grid-cols-3 gap-2 p-3 text-center`}>
            <ExchangeValue label="소모 작물" value={`${pending.itemName} ${quantity}개`} />
            <ExchangeValue label="받는 증표" value={`${pending.batches}개`} />
            <ExchangeValue label="교환 후" value={`${pending.owned - quantity}개`} />
          </div>
          <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
            오늘의 떨이 교환 횟수 {pending.batches}회를 사용합니다.
          </p>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
            >
              취소
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="rounded-md border border-emerald-600 bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:ring-offset-zinc-900"
            >
              {quantity}개 교환하기
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ExchangeValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
        {label}
      </div>
      <div className="mt-1 break-words text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
        {value}
      </div>
    </div>
  );
}
