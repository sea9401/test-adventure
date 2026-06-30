"use client";

import { Card } from "@/components/ui/Card";
import { PlayerNameLink } from "@/components/ui/PlayerNameLink";
import { parseAmount } from "@/components/ui/NumberInput";
import {
  CraftOnlyBadge,
  PerfectQualityBadge,
  powerNameClass,
  QualityPctText,
} from "@/adventure/v2/V2ItemCard";
import {
  V2_EQUIPMENT,
  type V2EquipInstance,
  type V2EquipRoll,
  type V2CraftedBy,
} from "@/adventure/data/v2/v2Equipment";
import type { V2EnhanceState } from "@/adventure/data/v2/v2Enhance";
import {
  equipDetail,
  netPreview,
  PriceInput,
  PriceRefLine,
  type PriceStat,
} from "./marketplaceShared";

// 판매 탭의 장비 개체 한 장(굴림% + 스탯줄 + 가격입력 + 등록 + 수령 미리보기).
export function EquipmentListingCard({
  inst,
  priceValue,
  onPriceChange,
  priceStat,
  busy,
  onList,
  onOpenCard,
}: {
  inst: V2EquipInstance;
  priceValue: string;
  onPriceChange: (v: string) => void;
  priceStat?: PriceStat;
  busy: boolean;
  onList: () => void;
  onOpenCard: (
    itemId: string,
    roll: V2EquipRoll | undefined,
    enhance: V2EnhanceState | undefined,
    craftedBy: V2CraftedBy | undefined,
    el: HTMLElement,
  ) => void;
}) {
  const item = V2_EQUIPMENT[inst.id];
  const detail = equipDetail(inst.id, inst.roll);
  const price = parseAmount(priceValue);
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
                inst.craftedBy,
                e.currentTarget,
              )
            }
            className="group min-w-0 text-left"
          >
            <div>
              <span
                className={`text-sm font-medium group-hover:underline group-focus-visible:underline ${
                  item ? powerNameClass(item, inst.roll) : ""
                }`}
              >
                {V2_EQUIPMENT[inst.id]?.name ?? inst.id}
                {inst.enhance && inst.enhance.level > 0 ? (
                  <span className="ml-1 text-amber-500">+{inst.enhance.level}</span>
                ) : null}
              </span>
              {item?.craftOnly ? <CraftOnlyBadge className="ml-1.5" /> : null}
              {detail?.pct != null && (
                <span className="ml-1.5 inline-flex items-center gap-1 text-[11px] tabular-nums">
                  <span className="text-zinc-500 dark:text-zinc-400">품질</span>
                  <QualityPctText pct={detail.pct} className="font-semibold" />
                  {detail.pct >= 100 ? <PerfectQualityBadge /> : null}
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
            <PriceRefLine stat={priceStat} />
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
        <div className="mt-1 text-right text-[11px] text-zinc-400">
          판매 시 수령 {netPreview(price).toLocaleString()}골드
        </div>
      )}
    </Card>
  );
}
