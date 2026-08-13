"use client";

import { ChartLine, Cube, Flask, Star } from "@phosphor-icons/react";
import { Card } from "@/components/ui/Card";
import { NumberInput, parseAmount } from "@/components/ui/NumberInput";
import { SURFACE_INSET } from "@/components/ui/surfaces";
import {
  marketplaceStackQuote,
  type MarketplaceStackGroup,
} from "./marketplaceShared";

export type BuyOrderBookSummary = {
  bestUnitPrice: number;
  totalQuantity: number;
};

export function MarketplaceStackBrowse({
  groups,
  quantities,
  onQuantityChange,
  onBuy,
  busy,
  favoriteKeys,
  onToggleFavorite,
  orderBook,
  onOpenTools,
}: {
  groups: MarketplaceStackGroup[];
  quantities: Record<string, string>;
  onQuantityChange: (key: string, value: string) => void;
  onBuy: (group: MarketplaceStackGroup) => void;
  busy: boolean;
  favoriteKeys: Set<string>;
  onToggleFavorite: (key: string) => void;
  orderBook: Record<string, BuyOrderBookSummary>;
  onOpenTools: (group: MarketplaceStackGroup) => void;
}) {
  return (
    <div className="space-y-2">
      {groups.map((group) => {
        const quantityText = quantities[group.key] ?? "1";
        const quantity = parseAmount(quantityText);
        const validQuantity =
          Number.isInteger(quantity) &&
          quantity >= 1 &&
          quantity <= group.totalQuantity;
        const quote = validQuantity
          ? marketplaceStackQuote(group.listings, quantity)
          : null;
        const GroupIcon = group.kind === "material" ? Cube : Flask;
        const favorite = favoriteKeys.has(group.key);
        const buyDemand = orderBook[group.key];
        return (
          <Card key={group.key} padding="none" className="overflow-hidden">
            <div className="flex items-start gap-3 p-3 sm:p-4">
              <div
                className={`${SURFACE_INSET} flex h-11 w-11 shrink-0 items-center justify-center text-sky-700 dark:text-sky-300`}
              >
                <GroupIcon size={23} weight="duotone" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold">{group.itemName}</div>
                    <div className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                      총 {group.totalQuantity.toLocaleString()}개 · 매물{" "}
                      {group.listings.length.toLocaleString()}건
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onOpenTools(group)}
                      className="inline-flex items-center gap-1 rounded-md border border-sky-200 bg-white px-2 py-1.5 text-[10px] font-semibold text-sky-700 dark:border-sky-800 dark:bg-zinc-900 dark:text-sky-300"
                    >
                      <ChartLine size={14} />
                      시세·주문
                    </button>
                    <button
                      type="button"
                      onClick={() => onToggleFavorite(group.key)}
                      aria-label={`${group.itemName} 즐겨찾기 ${favorite ? "해제" : "추가"}`}
                      className="rounded-md p-1.5 text-amber-500 transition hover:bg-amber-50 dark:hover:bg-amber-950"
                    >
                      <Star size={17} weight={favorite ? "fill" : "regular"} />
                    </button>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-end justify-between gap-2 border-t border-zinc-200 pt-2 dark:border-zinc-700">
                  <div>
                    <div className="text-[10px] text-zinc-500 dark:text-zinc-400">
                      최저 개당 가격
                    </div>
                    <div className="font-bold tabular-nums text-amber-700 dark:text-amber-400">
                      {group.minUnitPrice.toLocaleString()}G
                    </div>
                    {buyDemand ? (
                      <div className="mt-0.5 text-[10px] text-emerald-600 dark:text-emerald-400">
                        최고 구매 주문 {buyDemand.bestUnitPrice.toLocaleString()}G ·{" "}
                        {buyDemand.totalQuantity.toLocaleString()}개
                      </div>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <NumberInput
                      aria-label={`${group.itemName} 구매 수량`}
                      value={quantityText}
                      onValueChange={(value) =>
                        onQuantityChange(group.key, value)
                      }
                      min={1}
                      max={group.totalQuantity}
                      className="w-20 rounded-md border border-zinc-300 bg-white px-2 py-2 text-xs tabular-nums dark:border-zinc-700 dark:bg-zinc-900"
                    />
                    <button
                      type="button"
                      onClick={() => onBuy(group)}
                      disabled={busy || quote == null}
                      className="rounded-md border border-emerald-700 bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      {quote == null
                        ? "수량 확인"
                        : `${quote.toLocaleString()}G 구매`}
                    </button>
                  </div>
                </div>
                <div className="mt-1 text-right text-[10px] text-zinc-400">
                  최저가 매물부터 자동 구매
                </div>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

export function StackBuyConfirm({
  confirmation,
  availableGold,
  busy,
  onConfirm,
  onCancel,
}: {
  confirmation: {
    group: MarketplaceStackGroup;
    quantity: number;
    totalPrice: number;
  };
  availableGold: number | null;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const enough =
    availableGold === null || availableGold >= confirmation.totalPrice;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-base font-bold">묶음 구매 확인</h2>
        <div className="mt-3 text-sm font-semibold">
          {confirmation.group.itemName} ×
          {confirmation.quantity.toLocaleString()}
        </div>
        <div className={`${SURFACE_INSET} mt-3 space-y-1 p-3 text-xs`}>
          <div className="flex justify-between gap-3">
            <span className="text-zinc-500 dark:text-zinc-400">
              예상 결제액
            </span>
            <span className="font-bold tabular-nums text-amber-700 dark:text-amber-400">
              {confirmation.totalPrice.toLocaleString()}G
            </span>
          </div>
          <div className="text-[10px] text-zinc-400">
            확인한 금액보다 가격이 오르면 구매하지 않습니다.
          </div>
        </div>
        {!enough ? (
          <div className="mt-2 text-xs font-medium text-rose-600 dark:text-rose-400">
            골드가 부족해요.
          </div>
        ) : null}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy || !enough}
            className="rounded-md border border-emerald-700 bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            구매
          </button>
        </div>
      </div>
    </div>
  );
}
