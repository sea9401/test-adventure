"use client";

import type { Dispatch, SetStateAction } from "react";
import { Card } from "@/components/ui/Card";
import { Pagination } from "@/components/ui/Pagination";
import { V2_MATERIALS } from "@/adventure/data/v2/dungeonDrops";
import { marketplaceLifeItemDefinition } from "./lifeItemCatalog";
import {
  PriceInput,
  PriceQuickFill,
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
  hideEmpty = false,
}: {
  items: string[];
  pager: MarketplacePager<string>;
  materials: Record<string, number>;
  prices: Record<string, string>;
  setPrices: Dispatch<SetStateAction<Record<string, string>>>;
  qtys: Record<string, string>;
  setQtys: Dispatch<SetStateAction<Record<string, string>>>;
  priceRef: Record<string, PriceStat>;
  busy: boolean;
  onListMaterial: (matId: string) => void;
  hideEmpty?: boolean;
}) {
  if (items.length === 0) {
    if (hideEmpty) return null;
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
        const itemName =
          V2_MATERIALS[matId]?.name ??
          marketplaceLifeItemDefinition(matId)?.name ??
          matId;
        return (
          <Card key={matId} padding="sm">
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 text-sm font-medium">
                <span>
                  {itemName}
                  <span className="ml-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">보유 {have}</span>
                </span>
                <span className="ml-1.5 block sm:inline">
                  <PriceRefLine stat={priceRef[matId]} unit />
                </span>
                <PriceQuickFill
                  stat={priceRef[matId]}
                  unit
                  onSelect={(value) => {
                    const quantity = Number(qtys[matId] ?? "1");
                    const total = value * quantity;
                    if (Number.isSafeInteger(total) && total > 0) {
                      setPrices((current) => ({
                        ...current,
                        [matId]: String(total),
                      }));
                    }
                  }}
                />
              </span>
              <div className="flex shrink-0 items-center gap-1.5">
                <input
                  aria-label={`${itemName} 판매 수량`}
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
                  placeholder="묶음 전체 시작 입찰가"
                  ariaLabel={`${itemName} 묶음 전체 시작 입찰가`}
                />
                <button
                  type="button"
                  onClick={() => onListMaterial(matId)}
                  disabled={busy}
                  className="rounded-md border border-sky-700 bg-sky-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-sky-800 disabled:opacity-50"
                >
                  등록
                </button>
              </div>
            </div>
            <div className="mt-1 text-right text-[10px] text-zinc-500 dark:text-zinc-400">
              선택한 수량 전체가 한 번에 낙찰됩니다.
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
