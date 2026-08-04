"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { SURFACE_INSET } from "@/components/ui/surfaces";
import { PlayerNameLink } from "@/components/ui/PlayerNameLink";
import { parseAmount } from "@/components/ui/NumberInput";
import {
  CraftOnlyBadge,
  CraftQualityBadge,
  EquipmentTierBadge,
  EnhanceLevelBadge,
  MasterworkBadge,
  powerNameClass,
  QualityPctText,
} from "@/adventure/v2/V2ItemCard";
import {
  V2_EQUIPMENT,
  type V2EquipInstance,
  type V2EquipRoll,
  type V2CraftedBy,
  type V2CraftQualityState,
} from "@/adventure/data/v2/v2Equipment";
import type { V2EnhanceState } from "@/adventure/data/v2/v2Enhance";
import {
  equipDetail,
  netPreview,
  PriceInput,
  PriceQuickFill,
  PriceRefLine,
  type PriceStat,
} from "./marketplaceShared";
import type { EquipmentBuyOrderView } from "./equipmentBuyOrders";
import { equipmentPriceWarning } from "./equipmentPriceIntelligence";
import { EquipmentCodexBadge } from "@/adventure/v2/EquipmentCodexBadge";

// 판매 탭의 장비 개체 한 장(굴림% + 스탯줄 + 가격입력 + 등록 + 수령 미리보기).
export function EquipmentListingCard({
  inst,
  priceValue,
  onPriceChange,
  priceStat,
  priceScoped,
  busy,
  buyOrder,
  onList,
  onSellToBuyOrder,
  onOpenCard,
}: {
  inst: V2EquipInstance;
  priceValue: string;
  onPriceChange: (v: string) => void;
  priceStat?: PriceStat;
  priceScoped?: boolean;
  busy: boolean;
  buyOrder?: EquipmentBuyOrderView | null;
  onList: () => void;
  onSellToBuyOrder: () => void;
  onOpenCard: (
    itemId: string,
    roll: V2EquipRoll | undefined,
    enhance: V2EnhanceState | undefined,
    craftQuality: V2CraftQualityState | undefined,
    craftedBy: V2CraftedBy | undefined,
    el: HTMLElement,
  ) => void;
}) {
  const [confirmOrderSale, setConfirmOrderSale] = useState(false);
  const item = V2_EQUIPMENT[inst.id];
  const detail = equipDetail(inst.id, inst.roll, inst.enhance, inst.craftQuality);
  const price = parseAmount(priceValue);
  const priceWarning = equipmentPriceWarning(price, priceStat);
  return (
    <Card padding="sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <button
            type="button"
            onClick={(e) =>
              onOpenCard(
                inst.id,
                inst.roll,
                inst.enhance,
                inst.craftQuality,
                inst.craftedBy,
                e.currentTarget,
              )
            }
            className="group min-w-0 text-left"
          >
            <div>
              <span
                className={`text-sm font-medium group-hover:underline group-focus-visible:underline ${
                  item
                    ? powerNameClass(
                        item,
                        inst.roll,
                        inst.enhance,
                        inst.craftQuality,
                      )
                    : ""
                }`}
              >
                {V2_EQUIPMENT[inst.id]?.name ?? inst.id}
              </span>
              {item ? (
                <EquipmentTierBadge tier={item.tier} compact className="ml-1.5" />
              ) : null}
              {item ? (
                <EquipmentCodexBadge itemId={item.id} className="ml-1" />
              ) : null}
              <EnhanceLevelBadge enhance={inst.enhance} className="ml-1.5" />
              <CraftQualityBadge craftQuality={inst.craftQuality} className="ml-1" />
              {inst.craftedBy?.masterwork ? <MasterworkBadge className="ml-1" /> : null}
              {item?.craftOnly ? <CraftOnlyBadge className="ml-1.5" /> : null}
              {detail?.pct != null && (
                <span className="ml-1.5 inline-flex items-center gap-1 text-[11px] tabular-nums">
                  <span className="text-zinc-500 dark:text-zinc-400">품질</span>
                  <QualityPctText pct={detail.pct} className="font-semibold" />
                </span>
              )}
            </div>
            {detail && (
              <div className="mt-0.5 break-words text-[11px] text-zinc-600 dark:text-zinc-300">
                {detail.line}
              </div>
            )}
          </button>
          {inst.craftedBy ? (
            <div className="mt-0.5 text-[11px] text-emerald-700 dark:text-emerald-300">
              제작:{" "}
              <PlayerNameLink
                name={inst.craftedBy.name}
                className="font-medium"
                fallback="모험가"
              />{" "}
              · 대장장이 Lv{" "}
              {inst.craftedBy.level.toLocaleString()}
            </div>
          ) : null}
          <div className="mt-0.5">
            <PriceRefLine stat={priceStat} scoped={priceScoped} />
            <PriceQuickFill
              stat={priceStat}
              onSelect={(value) => onPriceChange(String(value))}
            />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <PriceInput value={priceValue} onChange={onPriceChange} />
          <button
            type="button"
            onClick={onList}
            disabled={busy}
            className="rounded-md border border-sky-600 bg-sky-600 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
          >
            등록
          </button>
        </div>
      </div>
      {Number.isInteger(price) && price >= 1 && (
        <div className="mt-1 text-right text-[11px]">
          {priceWarning ? (
            <span className="mr-2 font-medium text-amber-700 dark:text-amber-300">
              {priceWarning === "low"
                ? "비슷한 장비보다 많이 낮아요"
                : "비슷한 장비보다 많이 높아요"}
            </span>
          ) : null}
          <span className="text-zinc-400">
            판매 시 수령 {netPreview(price).toLocaleString()}골드
          </span>
        </div>
      )}
      {buyOrder ? (
        <div className={`${SURFACE_INSET} mt-2 p-2.5`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                최고 구매 주문 {buyOrder.unitPrice.toLocaleString()}G
              </div>
              <div className="mt-0.5 text-[10px] text-zinc-500 dark:text-zinc-400">
                최소 위력 {buyOrder.minPower.toLocaleString()} · 품질 {buyOrder.minQualityPct}% 이상
              </div>
            </div>
            {confirmOrderSale ? (
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setConfirmOrderSale(false)}
                  disabled={busy}
                  className="rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmOrderSale(false);
                    onSellToBuyOrder();
                  }}
                  disabled={busy}
                  className="rounded-md border border-emerald-700 bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                >
                  판매 확정
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmOrderSale(true)}
                disabled={busy}
                className="rounded-md border border-emerald-700 bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              >
                즉시 판매
              </button>
            )}
          </div>
          <div className="mt-1.5 text-[10px] text-zinc-500 dark:text-zinc-400">
            구매자는 공개되지 않으며 서버가 조건에 맞는 최고가·오래된 주문을 자동 선택합니다.
          </div>
        </div>
      ) : null}
    </Card>
  );
}
