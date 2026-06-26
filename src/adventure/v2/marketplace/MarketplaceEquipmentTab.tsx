"use client";

import type { Dispatch, SetStateAction } from "react";
import { Card } from "@/components/ui/Card";
import { Pagination } from "@/components/ui/Pagination";
import {
  type V2EquipInstance,
  type V2EquipRoll,
} from "@/adventure/data/v2/v2Equipment";
import {
  nextSortMode,
  sortModeLabel,
  type SortMode,
} from "../v2ItemListShared";
import { EquipmentListingCard } from "./EquipmentListingCard";
import { type MarketplacePager, type PriceStat } from "./marketplaceShared";

// 판매 탭 — 장비 슬롯. 빈 목록 안내 / 정렬 토글 + 장비 카드 목록 + 페이지네이션.
export function MarketplaceEquipmentTab({
  items,
  pager,
  sellSort,
  setSellSort,
  prices,
  setPrices,
  priceRef,
  busy,
  onListEquip,
  onOpenCard,
}: {
  items: V2EquipInstance[];
  pager: MarketplacePager<V2EquipInstance>;
  sellSort: SortMode;
  setSellSort: Dispatch<SetStateAction<SortMode>>;
  prices: Record<string, string>;
  setPrices: Dispatch<SetStateAction<Record<string, string>>>;
  priceRef: Record<string, PriceStat>;
  busy: boolean;
  onListEquip: (inst: V2EquipInstance) => void;
  onOpenCard: (itemId: string, roll: V2EquipRoll | undefined, el: HTMLElement) => void;
}) {
  if (items.length === 0) {
    return (
      <Card padding="sm">
        <div className="text-xs text-zinc-500 dark:text-zinc-400">
          팔 수 있는 장비가 없어요. (장착·잠금 장비는 제외)
        </div>
      </Card>
    );
  }
  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <button
          type="button"
          title="누를 때마다 정렬 전환 (기본 → 품질순 → 위력순)"
          onClick={() => setSellSort((m) => nextSortMode(m))}
          className="rounded border border-zinc-300 px-2.5 py-0.5 text-[11px] font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          정렬 ⇅ {sortModeLabel(sellSort)}
        </button>
      </div>
      {pager.pageItems.map((inst) => (
        <EquipmentListingCard
          key={inst.iid}
          inst={inst}
          priceValue={prices[inst.iid] ?? ""}
          onPriceChange={(v) => setPrices((p) => ({ ...p, [inst.iid]: v }))}
          priceStat={priceRef[inst.id]}
          busy={busy}
          onList={() => onListEquip(inst)}
          onOpenCard={onOpenCard}
        />
      ))}
      <Pagination
        page={pager.page}
        pageCount={pager.pageCount}
        setPage={pager.setPage}
      />
    </div>
  );
}
