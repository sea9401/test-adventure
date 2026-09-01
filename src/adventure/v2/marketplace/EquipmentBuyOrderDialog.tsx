"use client";

import { useState } from "react";
import { X } from "@phosphor-icons/react";
import { NumberInput, parseAmount } from "@/components/ui/NumberInput";
import { SURFACE_ACCENT, SURFACE_INSET } from "@/components/ui/surfaces";
import {
  V2_EQUIPMENT,
  V2_EQUIP_SETS,
  V2_EQUIP_TAG_SETS,
  sellPriceOf,
  type V2Equipment,
  type V2EquipmentId,
  type V2EquipSlot,
} from "@/adventure/data/v2/v2Equipment";
import type { PriceStat } from "./marketplaceShared";

const EQUIPMENT_SET_NAMES = new Map(
  [...V2_EQUIP_SETS, ...V2_EQUIP_TAG_SETS].map((set) => [set.id, set.name]),
);

function equipmentBuyOrderSetNames(item: V2Equipment): string[] {
  const setIds = [item.setId, ...(item.setTags ?? [])];
  return [
    ...new Set(
      setIds
        .map((setId) => (setId ? EQUIPMENT_SET_NAMES.get(setId) : undefined))
        .filter((name): name is string => name != null),
    ),
  ];
}

export function EquipmentBuyOrderDialog({
  slot,
  priceRef,
  busy,
  onCreate,
  onClose,
}: {
  slot: V2EquipSlot;
  priceRef: Record<string, PriceStat>;
  busy: boolean;
  onCreate: (
    itemId: V2EquipmentId,
    minPower: number,
    minQualityPct: number,
    unitPrice: number,
    days: number,
  ) => Promise<unknown>;
  onClose: () => void;
}) {
  const items = Object.values(V2_EQUIPMENT).filter(
    (item) => item.slot === slot && sellPriceOf(item) != null,
  );
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<V2EquipmentId | null>(
    items[0]?.id ?? null,
  );
  const selected = selectedId ? V2_EQUIPMENT[selectedId] : undefined;
  const floor = selected ? (sellPriceOf(selected) ?? 1) : 1;
  const suggestedPrice = selected
    ? Math.max(floor, Math.round(priceRef[selected.id]?.avg ?? floor))
    : floor;
  const [minPower, setMinPower] = useState(
    selected ? String(selected.power) : "1",
  );
  const [minQualityPct, setMinQualityPct] = useState("0");
  const [unitPrice, setUnitPrice] = useState(String(suggestedPrice));
  const [days, setDays] = useState("3");
  const normalized = query.trim().toLowerCase();
  const filtered = items.filter(
    (item) =>
      !normalized ||
      item.name.toLowerCase().includes(normalized) ||
      equipmentBuyOrderSetNames(item).some((name) =>
        name.toLowerCase().includes(normalized),
      ),
  );
  const parsedPower = parseAmount(minPower);
  const parsedQuality = parseAmount(minQualityPct);
  const parsedPrice = parseAmount(unitPrice);
  const parsedDays = parseAmount(days);
  const valid =
    selected != null &&
    Number.isInteger(parsedPower) &&
    parsedPower >= 1 &&
    Number.isInteger(parsedQuality) &&
    parsedQuality >= 0 &&
    parsedQuality <= 100 &&
    Number.isInteger(parsedPrice) &&
    parsedPrice >= floor &&
    Number.isInteger(parsedDays) &&
    parsedDays >= 1 &&
    parsedDays <= 7;

  const selectItem = (item: V2Equipment) => {
    const nextFloor = sellPriceOf(item) ?? 1;
    const nextSuggested = Math.max(
      nextFloor,
      Math.round(priceRef[item.id]?.avg ?? nextFloor),
    );
    setSelectedId(item.id);
    setMinPower(String(item.power));
    setMinQualityPct("0");
    setUnitPrice(String(nextSuggested));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-zinc-200 bg-white p-4 shadow-xl sm:rounded-2xl dark:border-zinc-700 dark:bg-zinc-900"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold">장비 구매 주문</h2>
            <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
              정확한 장비와 최소 위력·품질, 지불할 최대 가격을 정합니다.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기" className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800">
            <X size={18} />
          </button>
        </div>

        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="장비 이름 검색" className="mt-3 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950" />
        <div className="mt-2 max-h-40 overflow-y-auto rounded-md border border-zinc-200 p-1 dark:border-zinc-700">
          {filtered.length === 0 ? (
            <div className="p-4 text-center text-xs text-zinc-400">조건에 맞는 장비가 없어요.</div>
          ) : (
            filtered.map((item) => {
              const setNames = equipmentBuyOrderSetNames(item);
              return (
                <button key={item.id} type="button" onClick={() => selectItem(item)} className={`flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-xs ${selectedId === item.id ? "bg-sky-100 font-semibold text-sky-900 dark:bg-zinc-800 dark:text-sky-100" : "hover:bg-zinc-100 dark:hover:bg-zinc-800"}`}>
                  <span className="min-w-0">
                    <span className="block">{item.name}</span>
                    {setNames.length > 0 ? <span className="mt-0.5 block text-[10px] font-normal text-zinc-500 dark:text-zinc-400">{setNames.map((name) => `${name} 세트`).join(" · ")}</span> : null}
                  </span>
                  <span className="shrink-0 tabular-nums text-zinc-500 dark:text-zinc-400">기본 위력 {item.power.toLocaleString()}</span>
                </button>
              );
            })
          )}
        </div>

        {selected ? (
          <div className={`${SURFACE_INSET} mt-3 p-3`}>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <label className="space-y-1"><span className="block text-[10px] text-zinc-500 dark:text-zinc-400">최소 위력</span><NumberInput value={minPower} onValueChange={setMinPower} min={1} className="w-full rounded-md border border-zinc-300 bg-white px-2 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-950" /></label>
              <label className="space-y-1"><span className="block text-[10px] text-zinc-500 dark:text-zinc-400">최소 품질 %</span><NumberInput value={minQualityPct} onValueChange={setMinQualityPct} min={0} max={100} className="w-full rounded-md border border-zinc-300 bg-white px-2 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-950" /></label>
              <label className="space-y-1"><span className="block text-[10px] text-zinc-500 dark:text-zinc-400">최대 가격</span><NumberInput value={unitPrice} onValueChange={setUnitPrice} min={floor} className="w-full rounded-md border border-zinc-300 bg-white px-2 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-950" /></label>
              <label className="space-y-1"><span className="block text-[10px] text-zinc-500 dark:text-zinc-400">기간</span><select value={days} onChange={(event) => setDays(event.target.value)} className="w-full rounded-md border border-zinc-300 bg-white px-2 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-950">{[1, 3, 7].map((value) => <option key={value} value={value}>{value}일</option>)}</select></label>
            </div>
            <p className="mt-2 text-[10px] text-zinc-500 dark:text-zinc-400">최저 등록가는 NPC 매입가인 {floor.toLocaleString()}G입니다. 주문 골드는 등록 즉시 보관됩니다.</p>
          </div>
        ) : null}

        <div className={`${SURFACE_ACCENT} mt-3 p-3 text-[11px] text-amber-900 dark:text-amber-100`}>판매자는 구매자나 주문을 직접 고를 수 없습니다. 서버가 조건을 만족하는 주문 중 최고가, 동가에서는 먼저 등록된 주문을 자동 체결하며 모든 체결은 감사 기록에 남습니다.</div>
        <button type="button" disabled={busy || !valid || !selected} onClick={() => {
          if (!selected || !valid) return;
          void onCreate(selected.id, parsedPower, parsedQuality, parsedPrice, parsedDays).then((ok) => {
            if (ok) onClose();
          });
        }} className="mt-3 w-full rounded-md border border-sky-700 bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
          {busy ? "등록 중…" : "장비 구매 주문 등록"}
        </button>
      </div>
    </div>
  );
}
