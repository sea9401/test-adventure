"use client";

import type { Dispatch, SetStateAction } from "react";
import { Card } from "@/components/ui/Card";
import { Pagination } from "@/components/ui/Pagination";
import { V2_MATERIALS, type V2MaterialId } from "@/adventure/data/v2/dungeonDrops";
import {
  PriceInput,
  PriceRefLine,
  type MarketplacePager,
  type PriceStat,
} from "./marketplaceShared";

// 판매 탭 — 재료. 빈 목록 안내 / 수량+가격 입력 카드 목록 + 페이지네이션.
export function MarketplaceMaterialTab({
  items,
  pager,
  materials,
  prices,
  setPrices,
  qtys,
  setQtys,
  priceRef,
  busy,
  onListMaterial,
}: {
  items: V2MaterialId[];
  pager: MarketplacePager<V2MaterialId>;
  materials: Partial<Record<V2MaterialId, number>>;
  prices: Record<string, string>;
  setPrices: Dispatch<SetStateAction<Record<string, string>>>;
  qtys: Record<string, string>;
  setQtys: Dispatch<SetStateAction<Record<string, string>>>;
  priceRef: Record<string, PriceStat>;
  busy: boolean;
  onListMaterial: (matId: V2MaterialId) => void;
}) {
  if (items.length === 0) {
    return (
      <Card padding="sm">
        <div className="text-xs text-zinc-500 dark:text-zinc-400">
          팔 수 있는 재료가 없어요.
        </div>
      </Card>
    );
  }
  return (
    <div className="space-y-2">
      {pager.pageItems.map((matId) => {
        const have = materials[matId] ?? 0;
        return (
          <Card key={matId} padding="sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">
                {V2_MATERIALS[matId]?.name ?? matId}
                <span className="ml-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">보유 {have}</span>
                <span className="ml-1.5">
                  <PriceRefLine stat={priceRef[matId]} />
                </span>
              </span>
              <div className="flex shrink-0 items-center gap-1.5">
                <input
                  type="number"
                  min={1}
                  max={have}
                  placeholder="수량"
                  value={qtys[matId] ?? ""}
                  onChange={(e) => setQtys((q) => ({ ...q, [matId]: e.target.value }))}
                  className="w-16 rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                />
                <PriceInput
                  value={prices[matId] ?? ""}
                  onChange={(v) => setPrices((p) => ({ ...p, [matId]: v }))}
                />
                <button
                  type="button"
                  onClick={() => onListMaterial(matId)}
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
      <Pagination
        page={pager.page}
        pageCount={pager.pageCount}
        setPage={pager.setPage}
      />
    </div>
  );
}
