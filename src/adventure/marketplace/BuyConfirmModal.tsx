"use client";

import { useCallback, useRef, useState } from "react";
import { Card } from "@/components/ui/Card";
import { craftTierSuffix, type CraftTier } from "@/adventure/data/craftQuality";
import {
  dropQualityPrefix,
  type DropQuality,
} from "@/adventure/data/dropQuality";
import type { Listing } from "./types";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { useModalA11y } from "@/lib/useModalA11y";

// listing.variantKey → 표시용 prefix/suffix. base 면 둘 다 빈 문자열.
function variantAffix(variantKey: string): { prefix: string; suffix: string } {
  if (
    variantKey === "c-2" ||
    variantKey === "c-1" ||
    variantKey === "c1" ||
    variantKey === "c2"
  ) {
    return {
      prefix: "",
      suffix: craftTierSuffix(Number(variantKey.slice(1)) as CraftTier),
    };
  }
  if (variantKey === "d1" || variantKey === "d2") {
    return {
      prefix: dropQualityPrefix(Number(variantKey.slice(1)) as DropQuality),
      suffix: "",
    };
  }
  return { prefix: "", suffix: "" };
}

export function BuyConfirmModal({
  listing,
  currentGold,
  alreadyKnown,
  onConfirm,
  onClose,
}: {
  listing: Listing;
  currentGold: number;
  alreadyKnown?: boolean;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const after = currentGold - listing.price;
  const insufficient = after < 0;
  const isRecipe = listing.itemKind === "recipe";
  const blocked = alreadyKnown === true;
  const { prefix: variantPrefix, suffix: variantSuffix } =
    listing.itemKind === "equip"
      ? variantAffix(listing.variantKey)
      : { prefix: "", suffix: "" };
  const handleEscape = useCallback(() => {
    if (!busy) onClose();
  }, [busy, onClose]);
  useEscapeKey(handleEscape);
  const contentRef = useRef<HTMLDivElement>(null);
  useModalA11y(contentRef);

  const submit = async () => {
    if (insufficient || blocked) return;
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="buy-confirm-title"
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        ref={contentRef}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-4 shadow-xl dark:border-zinc-800 dark:bg-zinc-950"
      >
        <h2
          id="buy-confirm-title"
          className="text-base font-semibold text-zinc-900 dark:text-zinc-100"
        >
          구매 확인
        </h2>

        <div className="mt-3 space-y-2">
          <Card padding="sm">
            <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {isRecipe ? "📜 " : ""}
              {variantPrefix}
              {listing.itemName}
              {variantSuffix}
              {listing.itemKind === "material" && listing.quantity > 1 ? (
                <span className="ml-1 text-zinc-500">×{listing.quantity}</span>
              ) : null}
            </div>
            {blocked ? (
              <div className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                이미 알고 있는 제작서입니다.
              </div>
            ) : null}
          </Card>

          <dl className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex justify-between py-0.5">
              <dt className="text-zinc-500">가격</dt>
              <dd className="font-semibold text-amber-700 dark:text-amber-400">
                {listing.price.toLocaleString()} G
              </dd>
            </div>
            <div className="flex justify-between py-0.5">
              <dt className="text-zinc-500">현재 골드</dt>
              <dd>{currentGold.toLocaleString()} G</dd>
            </div>
            <div className="flex justify-between border-t border-zinc-200 py-0.5 dark:border-zinc-800">
              <dt className="text-zinc-500">구매 후</dt>
              <dd
                className={
                  insufficient
                    ? "font-semibold text-red-600 dark:text-red-400"
                    : "font-semibold"
                }
              >
                {after.toLocaleString()} G
                {insufficient ? " (부족)" : ""}
              </dd>
            </div>
          </dl>

          <div className="text-xs text-zinc-500">
            구매한 아이템은{" "}
            <strong className="text-zinc-700 dark:text-zinc-300">
              마을의 우편함
            </strong>{" "}
            에서 수령할 수 있습니다.
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            취소
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy || insufficient || blocked}
            className="rounded-md border border-emerald-700 bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy
              ? "구매 중…"
              : blocked
                ? "이미 보유"
                : insufficient
                  ? "골드 부족"
                  : "구매"}
          </button>
        </div>
      </div>
    </div>
  );
}
