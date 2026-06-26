"use client";

import { Card } from "@/components/ui/Card";
import { parseAmount } from "@/components/ui/NumberInput";
import {
  V2_EQUIPMENT,
  type V2EquipInstance,
  type V2EquipRoll,
} from "@/adventure/data/v2/v2Equipment";
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
  onOpenCard: (itemId: string, roll: V2EquipRoll | undefined, el: HTMLElement) => void;
}) {
  const detail = equipDetail(inst.id, inst.roll);
  const price = parseAmount(priceValue);
  return (
    <Card padding="sm">
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={(e) => onOpenCard(inst.id, inst.roll, e.currentTarget)}
          className="group min-w-0 text-left"
        >
          <div>
            <span className="text-sm font-medium group-hover:underline group-focus-visible:underline">
              {V2_EQUIPMENT[inst.id]?.name ?? inst.id}
              {inst.enhance && inst.enhance.level > 0 ? (
                <span className="ml-1 text-amber-500">+{inst.enhance.level}</span>
              ) : null}
            </span>
            {detail?.pct != null && (
              <span className="ml-1.5 text-[11px] text-amber-600 dark:text-amber-400">품질 {detail.pct}%</span>
            )}
          </div>
          {detail && (
            <div className="mt-0.5 break-words text-[11px] text-zinc-600 dark:text-zinc-300">
              {detail.line}
            </div>
          )}
          <div className="mt-0.5">
            <PriceRefLine stat={priceStat} />
          </div>
        </button>
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
