"use client";

import type { Dispatch, SetStateAction } from "react";
import { Card } from "@/components/ui/Card";
import { Pagination } from "@/components/ui/Pagination";
import { NumberInput } from "@/components/ui/NumberInput";
import { GameIcon } from "@/adventure/v2/GameIcon";
import {
  RARE_MAP_KINDS,
  type RareMapInstance,
} from "@/adventure/data/v2/rareMaps";
import {
  MUSEUN_CASH_ITEMS,
  MUSEUN_CASH_ITEM_IDS,
  type MuseunCashItemCounts,
  type MuseunCashItemId,
} from "@/adventure/data/v2/museunCashItems";
import {
  PriceInput,
  PriceRefLine,
  type MarketplacePager,
  type PriceStat,
} from "./marketplaceShared";

// 판매 탭 — 레어맵/희귀 장소. 빈 목록 안내 / 개체 단위 가격 입력 카드 목록.
export function MarketplaceRareMapTab({
  rareMaps,
  cashItems,
  pager,
  prices,
  setPrices,
  qtys,
  setQtys,
  priceRef,
  busy,
  onListConsumable,
  onListCashItem,
}: {
  rareMaps: RareMapInstance[];
  cashItems: MuseunCashItemCounts;
  pager: MarketplacePager<RareMapInstance>;
  prices: Record<string, string>;
  setPrices: Dispatch<SetStateAction<Record<string, string>>>;
  qtys: Record<string, string>;
  setQtys: Dispatch<SetStateAction<Record<string, string>>>;
  priceRef: Record<string, PriceStat>;
  busy: boolean;
  onListConsumable: (iid: string) => void;
  onListCashItem: (itemId: MuseunCashItemId) => void;
}) {
  const heldCashItems = MUSEUN_CASH_ITEM_IDS.filter(
    (itemId) => (cashItems[itemId] ?? 0) > 0,
  );
  if (rareMaps.length === 0 && heldCashItems.length === 0) {
    return (
      <Card padding="sm">
        <div className="text-xs text-zinc-500 dark:text-zinc-400">
          팔 수 있는 캐시 소모품이나 레어맵이 없어요.
        </div>
      </Card>
    );
  }
  return (
    <div className="space-y-2">
      {heldCashItems.map((itemId) => {
        const item = MUSEUN_CASH_ITEMS[itemId];
        const held = cashItems[itemId] ?? 0;
        return (
          <Card key={itemId} padding="sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
                <GameIcon
                  name="Ticket"
                  size={16}
                  className="shrink-0 text-amber-600 dark:text-amber-400"
                />
                <span>
                  {item.name}
                  <span className="ml-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                    보유 {held}개
                  </span>
                  <span className="ml-1.5">
                    <PriceRefLine stat={priceRef[itemId]} />
                  </span>
                </span>
              </span>
              <div className="flex shrink-0 items-center gap-1.5">
                <NumberInput
                  aria-label={`${item.name} 판매 수량`}
                  value={qtys[itemId] ?? "1"}
                  onValueChange={(value) =>
                    setQtys((current) => ({ ...current, [itemId]: value }))
                  }
                  min={1}
                  max={held}
                  className="w-16 rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs tabular-nums dark:border-zinc-700 dark:bg-zinc-900"
                />
                <PriceInput
                  value={prices[itemId] ?? ""}
                  onChange={(value) =>
                    setPrices((current) => ({
                      ...current,
                      [itemId]: value,
                    }))
                  }
                />
                <button
                  type="button"
                  onClick={() => onListCashItem(itemId)}
                  disabled={busy}
                  className="rounded-md border border-amber-600 bg-amber-600 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
                >
                  등록
                </button>
              </div>
            </div>
          </Card>
        );
      })}
      {pager.pageItems.map((m) => {
        const def = RARE_MAP_KINDS[m.kind];
        return (
          <Card key={m.iid} padding="sm">
            <div className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
                <GameIcon
                  name={
                    def?.category === "location"
                      ? "MapTrifold"
                      : def?.category === "hunt"
                        ? "Sparkle"
                        : "Ticket"
                  }
                  size={16}
                  className="shrink-0 text-sky-600 dark:text-sky-400"
                />
                <span className="min-w-0">
                  {def?.name ?? m.kind}
                  <span className="ml-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                    깊이 {m.depth} · 남은 {m.runsLeft}판
                  </span>
                  <span className="ml-1.5">
                    <PriceRefLine stat={priceRef[m.kind]} />
                  </span>
                </span>
              </span>
              <div className="flex shrink-0 items-center gap-1.5">
                <PriceInput
                  value={prices[m.iid] ?? ""}
                  onChange={(v) =>
                    setPrices((p) => ({ ...p, [m.iid]: v }))
                  }
                />
                <button
                  type="button"
                  onClick={() => onListConsumable(m.iid)}
                  disabled={busy}
                  className="rounded-md border border-sky-600 bg-sky-600 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
                >
                  등록
                </button>
              </div>
            </div>
          </Card>
        );
      })}
      {rareMaps.length > 0 && (
        <Pagination
          page={pager.page}
          pageCount={pager.pageCount}
          setPage={pager.setPage}
        />
      )}
    </div>
  );
}
