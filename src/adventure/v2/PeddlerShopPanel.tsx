"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { SURFACE_CARD } from "@/components/ui/surfaces";
import type { PeddlerShopView } from "./peddlerClient";
import { PEDDLER_SHOP_QUANTITY_LIMIT } from "./peddlerRules";

function formatNumber(value: number): string {
  return value.toLocaleString("ko-KR");
}

// 행상 증표 교환. 한도가 있는 품목은 이번 주에 바꾼 수량을 함께 보여 준다.
export function PeddlerShopPanel({
  items,
  tokens,
  busyKey,
  onBuy,
}: {
  items: readonly PeddlerShopView[];
  tokens: number;
  busyKey: string | null;
  onBuy: (item: PeddlerShopView, quantity: number) => void;
}) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  return (
    <section className={`${SURFACE_CARD} p-3`}>
      <SectionHeading title="증표 교환" />
      <ul className="mt-2 divide-y divide-zinc-200 dark:divide-zinc-800">
        {items.map((item) => {
          const remaining = item.weeklyLimit === null ? PEDDLER_SHOP_QUANTITY_LIMIT : item.weeklyLimit - item.purchased;
          const max = Math.max(0, Math.min(remaining, PEDDLER_SHOP_QUANTITY_LIMIT, Math.floor(tokens / item.tokenCost)));
          const quantity = Math.max(1, Math.min(quantities[item.id] ?? 1, Math.max(1, max)));
          return (
            <li key={item.id} data-testid={`peddler-shop-${item.id}`} className="flex items-center gap-2 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-zinc-900 dark:text-zinc-100">{item.name}</p>
                <p className="text-xs tabular-nums text-zinc-600 dark:text-zinc-300">
                  증표 {formatNumber(item.tokenCost)}개
                  {item.weeklyLimit === null ? "" : ` · 이번 주 ${item.purchased} / ${item.weeklyLimit}`}
                </p>
              </div>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={Math.max(1, max)}
                aria-label={`${item.name} 수량`}
                value={quantity}
                disabled={max < 1}
                onChange={(event) =>
                  setQuantities((current) => ({ ...current, [item.id]: Math.floor(Number(event.target.value)) || 1 }))
                }
                className="min-h-10 w-16 shrink-0 rounded-md border border-zinc-300 bg-white px-2 text-right text-sm tabular-nums text-zinc-900 disabled:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:disabled:text-zinc-600"
              />
              <Button
                className="min-h-10 shrink-0"
                disabled={max < 1}
                loading={busyKey === `shop:${item.id}`}
                onClick={() => onBuy(item, quantity)}
              >
                교환
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
