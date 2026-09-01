"use client";

import type { Dispatch, SetStateAction } from "react";
import Image from "next/image";
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
  MUSEUN_TRADEABLE_ITEM_IDS,
  type MuseunCashItemCounts,
  type MuseunCashItemId,
} from "@/adventure/data/v2/museunCashItems";
import {
  cookingEffectText,
  type CookingFoodDefinitionMap,
  type CookingFoodId,
  type CookingFoodInventory,
} from "@/adventure/v2/cooking/foodShared";
import {
  FISH,
  FISH_IDS,
  FISH_TIERS,
  type FishId,
} from "@/adventure/data/v2/fish";
import {
  fishSpecimenItemId,
  type FishSpecimenInventory,
} from "@/adventure/v2/fishSpecimens";
import { FishIcon } from "@/adventure/v2/FishIcon";
import {
  PriceInput,
  PriceQuickFill,
  PriceRefLine,
  type MarketplacePager,
  type PriceStat,
} from "./marketplaceShared";

// 판매 탭 — 레어맵/희귀 장소. 빈 목록 안내 / 개체 단위 가격 입력 카드 목록.
export function MarketplaceRareMapTab({
  rareMaps,
  cashItems,
  cookingFoods,
  cookingFoodDefinitions,
  fishSpecimens,
  pager,
  prices,
  setPrices,
  qtys,
  setQtys,
  priceRef,
  busy,
  onListConsumable,
  onListCashItem,
  onListCookingFood,
  onListFishSpecimen,
  hideEmpty = false,
}: {
  rareMaps: RareMapInstance[];
  cashItems: MuseunCashItemCounts;
  cookingFoods: CookingFoodInventory;
  cookingFoodDefinitions: CookingFoodDefinitionMap;
  fishSpecimens: FishSpecimenInventory["items"];
  pager: MarketplacePager<RareMapInstance>;
  prices: Record<string, string>;
  setPrices: Dispatch<SetStateAction<Record<string, string>>>;
  qtys: Record<string, string>;
  setQtys: Dispatch<SetStateAction<Record<string, string>>>;
  priceRef: Record<string, PriceStat>;
  busy: boolean;
  onListConsumable: (iid: string) => void;
  onListCashItem: (itemId: MuseunCashItemId) => void;
  onListCookingFood: (itemId: CookingFoodId) => void;
  onListFishSpecimen: (fishId: FishId) => void;
  hideEmpty?: boolean;
}) {
  const heldCashItems = MUSEUN_TRADEABLE_ITEM_IDS.filter(
    (itemId) => (cashItems[itemId] ?? 0) > 0,
  );
  const heldCookingFoods = Object.entries(cookingFoods)
    .map(([itemId, count]) => ({
      itemId: itemId as CookingFoodId,
      count: Math.max(0, Math.floor(count ?? 0)),
      definition: cookingFoodDefinitions[itemId as CookingFoodId],
    }))
    .filter((entry) => entry.count > 0 && entry.definition != null);
  const heldFishSpecimens = FISH_IDS.flatMap((fishId) => {
    const count = fishSpecimens[fishId] ?? 0;
    return count > 0 ? [{ fishId, count }] : [];
  });
  if (
    rareMaps.length === 0 &&
    heldCashItems.length === 0 &&
    heldCookingFoods.length === 0 &&
    heldFishSpecimens.length === 0
  ) {
    if (hideEmpty) return null;
    return (
      <Card padding="sm">
        <div className="text-xs text-zinc-500 dark:text-zinc-400">
          팔 수 있는 표본·음식·캐시 소모품이나 레어맵이 없어요.
        </div>
      </Card>
    );
  }
  const wholeLotPrice = (itemId: string, unitPrice: number) => {
    const quantity = Number(qtys[itemId] ?? "1");
    return unitPrice * (Number.isInteger(quantity) && quantity > 0 ? quantity : 1);
  };
  return (
    <div className="space-y-2">
      <Card padding="sm">
        <p className="text-[11px] text-zinc-600 dark:text-zinc-300">
          선택한 수량 전체가 한 번에 낙찰됩니다. 나누어 팔려면 여러 번 등록해 주세요.
        </p>
      </Card>
      {heldFishSpecimens.map(({ fishId, count }) => {
        const fish = FISH[fishId];
        const itemId = fishSpecimenItemId(fishId);
        return (
          <Card key={itemId} padding="sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
                <FishIcon fishId={fishId} name={fish.name} className="h-9 w-9 shrink-0" />
                <span className="min-w-0">
                  <span className="block truncate">{fish.name} 표본</span>
                  <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    보유 {count}개 · {FISH_TIERS[fish.tier].label}
                  </span>
                  <span className="ml-1.5">
                    <PriceRefLine stat={priceRef[itemId]} unit />
                  </span>
                  <PriceQuickFill
                    stat={priceRef[itemId]}
                    unit
                    onSelect={(value) =>
                      setPrices((current) => ({
                        ...current,
                        [itemId]: String(wholeLotPrice(itemId, value)),
                      }))
                    }
                  />
                </span>
              </span>
              <div className="flex shrink-0 items-center gap-1.5">
                <NumberInput
                  aria-label={`${fish.name} 표본 판매 수량`}
                  value={qtys[itemId] ?? "1"}
                  onValueChange={(value) =>
                    setQtys((current) => ({ ...current, [itemId]: value }))
                  }
                  min={1}
                  max={count}
                  className="w-16 rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs tabular-nums dark:border-zinc-700 dark:bg-zinc-900"
                />
                <PriceInput
                  value={prices[itemId] ?? ""}
                  onChange={(value) =>
                    setPrices((current) => ({ ...current, [itemId]: value }))
                  }
                  placeholder="묶음 전체 시작 입찰가"
                />
                <button
                  type="button"
                  onClick={() => onListFishSpecimen(fishId)}
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
      {heldCookingFoods.map(({ itemId, count, definition }) => {
        if (!definition) return null;
        const statLine = cookingEffectText(definition.effect);
        return (
          <Card key={itemId} padding="sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
                <Image
                  src={definition.recipe.imageSrc}
                  alt=""
                  width={40}
                  height={40}
                  unoptimized
                  className="h-10 w-10 shrink-0 object-contain"
                />
                <span className="min-w-0">
                  <span className="block truncate">{definition.name}</span>
                  <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    보유 {count}개 · {statLine}
                  </span>
                  <span className="ml-1.5">
                    <PriceRefLine stat={priceRef[itemId]} unit />
                  </span>
                  <PriceQuickFill
                    stat={priceRef[itemId]}
                    unit
                    onSelect={(value) =>
                      setPrices((current) => ({
                        ...current,
                        [itemId]: String(wholeLotPrice(itemId, value)),
                      }))
                    }
                  />
                </span>
              </span>
              <div className="flex shrink-0 items-center gap-1.5">
                <NumberInput
                  aria-label={`${definition.name} 판매 수량`}
                  value={qtys[itemId] ?? "1"}
                  onValueChange={(value) =>
                    setQtys((current) => ({ ...current, [itemId]: value }))
                  }
                  min={1}
                  max={count}
                  className="w-16 rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs tabular-nums dark:border-zinc-700 dark:bg-zinc-900"
                />
                <PriceInput
                  value={prices[itemId] ?? ""}
                  onChange={(value) =>
                    setPrices((current) => ({ ...current, [itemId]: value }))
                  }
                  placeholder="묶음 전체 시작 입찰가"
                />
                <button
                  type="button"
                  onClick={() => onListCookingFood(itemId)}
                  disabled={busy}
                  className="rounded-md border border-emerald-600 bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
                >
                  등록
                </button>
              </div>
            </div>
          </Card>
        );
      })}
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
                    <PriceRefLine stat={priceRef[itemId]} unit />
                  </span>
                  <PriceQuickFill
                    stat={priceRef[itemId]}
                    unit
                    onSelect={(value) =>
                      setPrices((current) => ({
                        ...current,
                        [itemId]: String(wholeLotPrice(itemId, value)),
                      }))
                    }
                  />
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
                  placeholder="묶음 전체 시작 입찰가"
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
                  <PriceQuickFill
                    stat={priceRef[m.kind]}
                    onSelect={(value) =>
                      setPrices((current) => ({
                        ...current,
                        [m.iid]: String(value),
                      }))
                    }
                  />
                </span>
              </span>
              <div className="flex shrink-0 items-center gap-1.5">
                <PriceInput
                  value={prices[m.iid] ?? ""}
                  onChange={(v) =>
                    setPrices((p) => ({ ...p, [m.iid]: v }))
                  }
                  placeholder="시작 입찰가"
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
