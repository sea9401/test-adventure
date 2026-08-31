"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { Card } from "@/components/ui/Card";
import { Pagination } from "@/components/ui/Pagination";
import { SURFACE_INSET } from "@/components/ui/surfaces";
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
  bestEquipmentBuyOrder,
  equipmentBatchSaleCandidates,
  type EquipmentBuyOrderView,
} from "./equipmentBuyOrders";
import { comparableEquipmentPriceStat } from "./equipmentPriceIntelligence";
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
  equipmentBuyOrders,
  onListEquip,
  onSellToBuyOrder,
  onSellBatchToBuyOrders,
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
  equipmentBuyOrders: EquipmentBuyOrderView[];
  onListEquip: (inst: V2EquipInstance) => void;
  onSellToBuyOrder: (inst: V2EquipInstance) => void;
  onSellBatchToBuyOrders: (instances: V2EquipInstance[]) => void;
  onOpenCard: (
    itemId: string,
    roll: V2EquipRoll | undefined,
    enhance: V2EnhanceState | undefined,
    craftQuality: V2CraftQualityState | undefined,
    craftedBy: V2CraftedBy | undefined,
    el: HTMLElement,
  ) => void;
}) {
  const [confirmBatch, setConfirmBatch] = useState(false);
  const batchCandidates = equipmentBatchSaleCandidates(
    equipmentBuyOrders,
    pager.pageItems,
    10,
  );
  const batchGross = batchCandidates.reduce(
    (sum, row) => sum + row.order.unitPrice,
    0,
  );
  if (items.length === 0 && craftFilter === "all") {
    return (
      <Card padding="sm">
        <div className="text-xs text-zinc-500 dark:text-zinc-400">
          팔 수 있는 장비가 없어요. (강화·장착·잠금 장비는 제외)
        </div>
      </Card>
    );
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap justify-end gap-1.5">
        {batchCandidates.length >= 2 ? (
          <button
            type="button"
            onClick={() => setConfirmBatch(true)}
            disabled={busy}
            className="rounded border border-emerald-600 bg-emerald-600 px-2.5 py-0.5 text-[11px] font-semibold text-white disabled:opacity-50"
          >
            일괄 판매 {batchCandidates.length}개
          </button>
        ) : null}
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
          title="누를 때마다 정렬 전환 (기본 → 획득순 → 티어순 → 품질순 → 위력순)"
          onClick={() => setSellSort((m) => nextSortMode(m))}
          className="rounded border border-zinc-300 px-2.5 py-0.5 text-[11px] font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          정렬 ⇅ {sortModeLabel(sellSort)}
        </button>
      </div>
      {confirmBatch ? (
        <div className={`${SURFACE_INSET} p-3`}>
          <div className="text-sm font-semibold">
            구매 주문에 장비 {batchCandidates.length}개를 판매할까요?
          </div>
          <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
            현재 체결가 합계 {batchGross.toLocaleString()}G · 체결 직전에 서버가 최고가 주문을 다시 확인합니다.
          </div>
          <div className="mt-2 flex justify-end gap-1.5">
            <button
              type="button"
              onClick={() => setConfirmBatch(false)}
              disabled={busy}
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950"
            >
              취소
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmBatch(false);
                onSellBatchToBuyOrders(
                  batchCandidates.map((row) => row.instance),
                );
              }}
              disabled={busy || batchCandidates.length < 2}
              className="rounded-md border border-emerald-700 bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              판매 확정
            </button>
          </div>
        </div>
      ) : null}
      <div className={`${SURFACE_INSET} px-2.5 py-1.5 text-[11px] text-emerald-800 dark:text-emerald-200`}>
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
            const buyOrder = bestEquipmentBuyOrder(equipmentBuyOrders, inst);
            const comparablePriceStat = comparableEquipmentPriceStat(
              priceRef,
              inst,
            );
            return (
              <EquipmentListingCard
                key={inst.iid}
                inst={inst}
                priceValue={prices[inst.iid] ?? ""}
                onPriceChange={(v) =>
                  setPrices((p) => ({ ...p, [inst.iid]: v }))
                }
                priceStat={
                  comparablePriceStat ??
                  priceStatForKey(priceRef, inst.id, priceKey)
                }
                priceScoped={
                  comparablePriceStat != null ||
                  (priceKey !== inst.id && !!priceRef[priceKey])
                }
                busy={busy}
                buyOrder={buyOrder}
                onList={() => onListEquip(inst)}
                onSellToBuyOrder={() => onSellToBuyOrder(inst)}
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
