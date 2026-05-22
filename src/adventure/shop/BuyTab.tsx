"use client";

import { useState } from "react";
import { Coins } from "@phosphor-icons/react";
import { POTIONS, POTION_IDS, potionMax, type PotionId } from "../data/potions";
import { MATERIALS, type MaterialId } from "../data/materials";
import {
  CONSUMABLES,
  CONSUMABLE_IDS,
  type ConsumableId,
} from "../data/consumables";
import { ITEMS, type ItemId } from "../data/items";
import type { InventoryState } from "../inventory/useInventory";
import { TabBar } from "@/components/ui/TabBar";
import { LIST_ROW } from "@/components/ui/listRow";
import { QtyStepper } from "./QtyStepper";
import { SHOP_PURCHASE_QTY_MAX } from "./constants";

// 상점에서 살 수 있는 장비 — EquipItem.shopPrice 가 지정된 것 (현재 초반 발판용 싸구려 한두 종).
const SHOP_EQUIPMENT_IDS = (Object.keys(ITEMS) as ItemId[]).filter(
  (id) => typeof (ITEMS[id] as { shopPrice?: number }).shopPrice === "number",
);

// crafting flag 별 게이트 — items.ts EquipItem.shopGate 와 짝.
type CraftingShopGates = {
  boldQuestComplete: boolean;
};

function isEquipmentGated(id: ItemId, gates: CraftingShopGates): boolean {
  const gate = (ITEMS[id] as { shopGate?: keyof CraftingShopGates }).shopGate;
  if (!gate) return false;
  return !gates[gate];
}

type BuyCategoryKey = "equipment" | "materials" | "consumables";

// 카테고리 순서는 SellTab 과 동일하게 — 장비 → 재료 → 소모품. 포션은 소모품 탭에서 같이 노출.
const BUY_TABS: { key: BuyCategoryKey; label: string }[] = [
  { key: "equipment", label: "장비" },
  { key: "materials", label: "재료" },
  { key: "consumables", label: "소모품" },
];

export function BuyTab({
  gold,
  inventory,
  isMaterialBuyable,
  craftingGates,
  onPurchasePotion,
  onPurchaseMaterial,
  onPurchaseConsumable,
  onPurchaseEquipment,
}: {
  gold: number;
  inventory: InventoryState;
  isMaterialBuyable: (id: MaterialId) => boolean;
  craftingGates: CraftingShopGates;
  onPurchasePotion: (id: PotionId, quantity: number) => void;
  onPurchaseMaterial: (id: MaterialId, quantity: number) => void;
  onPurchaseConsumable: (id: ConsumableId, quantity: number) => void;
  onPurchaseEquipment: (id: ItemId, quantity: number) => void;
}) {
  const [category, setCategory] = useState<BuyCategoryKey>("equipment");
  const equipmentIds = SHOP_EQUIPMENT_IDS.filter(
    (id) => !isEquipmentGated(id, craftingGates),
  );

  // 구매 가능 재료 = 항상 취급(`inShop`) 또는 누적 100개 이상 판매로 잠금 해제된 것.
  const materialIds = (Object.keys(MATERIALS) as MaterialId[]).filter(
    (id) => MATERIALS[id].inShop || isMaterialBuyable(id),
  );
  const cap = potionMax(inventory.potionCapacityBonus ?? 0);
  const potionIds = POTION_IDS.filter((id) => POTIONS[id].inShop !== false);

  return (
    <div className="space-y-3">
      <TabBar
        tabs={BUY_TABS}
        active={category}
        onChange={setCategory}
        ariaLabel="구매 카테고리"
      />

      {category === "equipment" &&
        (equipmentIds.length > 0 ? (
          <ul className="space-y-1.5">
            {equipmentIds.map((id) => {
              const item = ITEMS[id];
              const price = (item as { shopPrice: number }).shopPrice;
              const statSummary = item.stats
                .map((s) => `${s.label} ${s.value}`)
                .join(", ");
              const owned = inventory.equipment[id] ?? 0;
              return (
                <BuyRow
                  key={id}
                  name={item.name}
                  description={`${statSummary}${
                    item.description ? ` — ${item.description}` : ""
                  }`}
                  price={price}
                  owned={owned}
                  gold={gold}
                  onPurchase={(qty) => onPurchaseEquipment(id, qty)}
                />
              );
            })}
          </ul>
        ) : (
          <BuyCategoryEmpty label="장비" />
        ))}

      {category === "materials" &&
        (materialIds.length > 0 ? (
          <ul className="space-y-1.5">
            {materialIds.map((id) => {
              const m = MATERIALS[id];
              const owned = inventory.materials[id] ?? 0;
              return (
                <BuyRow
                  key={id}
                  name={m.name}
                  description={m.description}
                  price={m.price}
                  owned={owned}
                  gold={gold}
                  onPurchase={(qty) => onPurchaseMaterial(id, qty)}
                />
              );
            })}
          </ul>
        ) : (
          <BuyCategoryEmpty label="재료" />
        ))}

      {category === "consumables" &&
        (potionIds.length > 0 || CONSUMABLE_IDS.length > 0 ? (
          <ul className="space-y-1.5">
            {potionIds.map((id) => {
              const potion = POTIONS[id];
              const owned = inventory.potions[id] ?? 0;
              return (
                <BuyRow
                  key={id}
                  name={potion.name}
                  description={potion.description}
                  price={potion.shopPrice ?? potion.price}
                  owned={owned}
                  gold={gold}
                  cap={cap}
                  onPurchase={(qty) => onPurchasePotion(id, qty)}
                />
              );
            })}
            {CONSUMABLE_IDS.map((id) => {
              const c = CONSUMABLES[id];
              const owned = inventory.consumables[id] ?? 0;
              return (
                <BuyRow
                  key={id}
                  name={c.name}
                  description={c.description}
                  price={c.price}
                  owned={owned}
                  gold={gold}
                  onPurchase={(qty) => onPurchaseConsumable(id, qty)}
                />
              );
            })}
          </ul>
        ) : (
          <BuyCategoryEmpty label="소모품" />
        ))}
    </div>
  );
}

function BuyCategoryEmpty({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-dashed border-zinc-300 bg-white/60 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950/60 dark:text-zinc-400">
      판매 중인 {label}이(가) 없습니다.
    </div>
  );
}

function BuyRow({
  name,
  description,
  price,
  owned,
  gold,
  cap,
  onPurchase,
}: {
  name: string;
  description: string;
  price: number;
  owned: number;
  gold: number;
  cap?: number;
  onPurchase: (quantity: number) => void;
}) {
  const [qty, setQty] = useState(1);
  const room = cap !== undefined ? Math.max(0, cap - owned) : Infinity;
  const isFull = cap !== undefined && owned >= cap;
  // 1회 구매 상한 = min(상점 한도 99, 인벤 여유분). 둘 다 정수.
  const qtyMax = Math.min(SHOP_PURCHASE_QTY_MAX, room);
  const effectiveQty = Math.min(qty, qtyMax);
  const totalCost = price * effectiveQty;
  const canAfford = gold >= totalCost;
  const canPurchase = !isFull && effectiveQty > 0 && canAfford;

  return (
    <li className={LIST_ROW}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {name}
        </span>
        <span className="shrink-0 text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
          보유 {owned}
          {cap !== undefined ? ` / ${cap}` : ""}
        </span>
      </div>
      <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
        {description}
      </p>
      <div className="mt-1.5 flex items-center gap-2">
        <div className="inline-flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-400">
          <Coins size={12} weight="fill" className="text-yellow-500" />
          <span className="tabular-nums">{price.toLocaleString()}</span>
          <span>/ 개</span>
        </div>
        <div className="ml-auto inline-flex items-center gap-1">
          <QtyStepper
            qty={qty}
            setQty={setQty}
            min={1}
            max={qtyMax || 1}
            disabled={isFull}
          />
          <button
            type="button"
            onClick={() => {
              if (canPurchase) {
                onPurchase(effectiveQty);
                setQty(1);
              }
            }}
            disabled={!canPurchase}
            className="ml-1 inline-flex items-center gap-1 rounded-md border border-emerald-500 bg-emerald-500/10 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-400 dark:text-emerald-300"
          >
            {isFull ? "가득 참" : "구매"}
            {!isFull && (
              <span className="inline-flex items-center gap-0.5 text-xs tabular-nums">
                <Coins size={10} weight="fill" className="text-yellow-500" />
                {totalCost.toLocaleString()}
              </span>
            )}
          </button>
        </div>
      </div>
    </li>
  );
}
