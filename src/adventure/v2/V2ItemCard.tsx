"use client";

import { useRef } from "react";
import { X } from "@phosphor-icons/react";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { useModalA11y } from "@/lib/useModalA11y";
import {
  v2EquipStatEntries,
  type V2Equipment,
} from "@/adventure/data/v2/v2Equipment";

// 장비 아이템 옵션 카드 — 슬롯 클릭 시 떠오르는 상세 팝업.
// 이름·티어·옵션(스탯)·설명만. 컨셉 태그(힘/민/지 등)는 노출하지 않음 (사용자 의도).

export function V2ItemCard({
  item,
  onClose,
}: {
  item: V2Equipment;
  onClose: () => void;
}) {
  useEscapeKey(onClose);
  const contentRef = useRef<HTMLDivElement>(null);
  useModalA11y(contentRef);

  const options = v2EquipStatEntries(item.stats);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="v2-item-card-title"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
    >
      <div
        ref={contentRef}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xs rounded-lg border border-zinc-200 bg-white p-5 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-baseline gap-1.5">
            <h2
              id="v2-item-card-title"
              className="text-base font-semibold text-zinc-900 dark:text-zinc-100"
            >
              {item.name}
            </h2>
            <span className="shrink-0 rounded bg-zinc-200 px-1 py-px text-[10px] font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              T{item.tier}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="-mr-2 -mt-1 inline-flex h-9 w-9 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            <X size={18} weight="bold" />
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-1">
          {options.length === 0 ? (
            <span className="text-xs text-zinc-400 dark:text-zinc-500">
              옵션 없음
            </span>
          ) : (
            options.map((s) => (
              <span
                key={s}
                className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs tabular-nums text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
              >
                {s}
              </span>
            ))
          )}
        </div>

        {item.description && (
          <p className="mt-3 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
            {item.description}
          </p>
        )}
      </div>
    </div>
  );
}
