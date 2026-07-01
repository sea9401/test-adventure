"use client";

import type { Dispatch, SetStateAction } from "react";
import { Card } from "@/components/ui/Card";
import { Pagination } from "@/components/ui/Pagination";
import {
  type V2EquipInstance,
  type V2EquipRoll,
  type V2CraftedBy,
  type V2CraftQualityState,
} from "@/adventure/data/v2/v2Equipment";
import type { V2EnhanceState } from "@/adventure/data/v2/v2Enhance";
import {
  nextSortMode,
  sortModeLabel,
  type SortMode,
} from "../v2ItemListShared";
import { EquipmentListingCard } from "./EquipmentListingCard";
import {
  marketplacePriceKeyForEquipInstance,
  priceStatForKey,
  type MarketplacePager,
  type PriceStat,
} from "./marketplaceShared";

type SellCraftFilter = "all" | "crafted" | "quality" | "masterwork" | "craftOnly";

const SELL_CRAFT_FILTER_OPTIONS: [SellCraftFilter, string][] = [
  ["all", "전체"],
  ["crafted", "제작품"],
  ["quality", "★ 제작품"],
  ["masterwork", "명장"],
  ["craftOnly", "전용"],
];

// 판매 탭 — 장비 슬롯. 빈 목록 안내 / 정렬 토글 + 장비 카드 목록 + 페이지네이션.
export function MarketplaceEquipmentTab({
  items,
  pager,
  sellSort,
  setSellSort,
  craftFilter,
  setCraftFilter,
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
  craftFilter: SellCraftFilter;
  setCraftFilter: Dispatch<SetStateAction<SellCraftFilter>>;
  prices: Record<string, string>;
  setPrices: Dispatch<SetStateAction<Record<string, string>>>;
  priceRef: Record<string, PriceStat>;
  busy: boolean;
  onListEquip: (inst: V2EquipInstance) => void;
  onOpenCard: (
    itemId: string,
    roll: V2EquipRoll | undefined,
    enhance: V2EnhanceState | undefined,
    craftQuality: V2CraftQualityState | undefined,
    craftedBy: V2CraftedBy | undefined,
    el: HTMLElement,
  ) => void;
}) {
  if (items.length === 0 && craftFilter === "all") {
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
      <div className="flex flex-wrap justify-end gap-1.5">
        <select
          value={craftFilter}
          onChange={(e) => setCraftFilter(e.target.value as SellCraftFilter)}
          className="rounded border border-zinc-300 bg-white px-2 py-0.5 text-[11px] font-medium text-zinc-700 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
        >
          {SELL_CRAFT_FILTER_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <button
          type="button"
          title="누를 때마다 정렬 전환 (기본 → 품질순 → 위력순)"
          onClick={() => setSellSort((m) => nextSortMode(m))}
          className="rounded border border-zinc-300 px-2.5 py-0.5 text-[11px] font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          정렬 ⇅ {sortModeLabel(sellSort)}
        </button>
      </div>
      <div className="rounded border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
        제작품은 ★ 품질, 명장 표식, 제작 전용 여부에 따라 실거래가가 크게
        갈릴 수 있어요. 필터로 같은 계열만 묶어서 가격을 잡는 편이 안전합니다.
      </div>
      {items.length === 0 ? (
        <Card padding="sm">
          <div className="text-xs text-zinc-500 dark:text-zinc-400">
            선택한 조건에 맞는 판매 가능 장비가 없어요.
          </div>
        </Card>
      ) : (
        <>
          {pager.pageItems.map((inst) => {
            const priceKey = marketplacePriceKeyForEquipInstance(inst);
            return (
              <EquipmentListingCard
                key={inst.iid}
                inst={inst}
                priceValue={prices[inst.iid] ?? ""}
                onPriceChange={(v) =>
                  setPrices((p) => ({ ...p, [inst.iid]: v }))
                }
                priceStat={priceStatForKey(priceRef, inst.id, priceKey)}
                priceScoped={priceKey !== inst.id && !!priceRef[priceKey]}
                busy={busy}
                onList={() => onListEquip(inst)}
                onOpenCard={onOpenCard}
              />
            );
          })}
          <Pagination
            page={pager.page}
            pageCount={pager.pageCount}
            setPage={pager.setPage}
          />
        </>
      )}
    </div>
  );
}
