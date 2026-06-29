"use client";

import type { Dispatch, SetStateAction } from "react";
import { Card } from "@/components/ui/Card";
import { Pagination } from "@/components/ui/Pagination";
import {
  RARE_MAP_KINDS,
  type RareMapInstance,
} from "@/adventure/data/v2/rareMaps";
import {
  PriceInput,
  PriceRefLine,
  type MarketplacePager,
  type PriceStat,
} from "./marketplaceShared";

// 판매 탭 — 소모품(레어맵). 빈 목록 안내 / 개체 단위 가격 입력 카드 목록.
export function MarketplaceRareMapTab({
  rareMaps,
  pager,
  prices,
  setPrices,
  priceRef,
  busy,
  onListConsumable,
}: {
  rareMaps: RareMapInstance[];
  pager: MarketplacePager<RareMapInstance>;
  prices: Record<string, string>;
  setPrices: Dispatch<SetStateAction<Record<string, string>>>;
  priceRef: Record<string, PriceStat>;
  busy: boolean;
  onListConsumable: (iid: string) => void;
}) {
  if (rareMaps.length === 0) {
    return (
      <Card padding="sm">
        <div className="text-xs text-zinc-500 dark:text-zinc-400">
          팔 수 있는 소모품이 없어요. 레어맵은 사냥 중 아주 낮은
          확률로 발견됩니다.
        </div>
      </Card>
    );
  }
  return (
    <div className="space-y-2">
      {pager.pageItems.map((m) => {
        const def = RARE_MAP_KINDS[m.kind];
        return (
          <Card key={m.iid} padding="sm">
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 text-sm font-medium">
                🗺 {def?.name ?? m.kind}
                <span className="ml-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                  깊이 {m.depth} · 남은 {m.runsLeft}판
                </span>
                <span className="ml-1.5">
                  <PriceRefLine stat={priceRef[m.kind]} />
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
      <Pagination
        page={pager.page}
        pageCount={pager.pageCount}
        setPage={pager.setPage}
      />
    </div>
  );
}
