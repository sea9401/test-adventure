"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  CheckCircle,
  HandFist,
  Lock,
  MagnifyingGlass,
  Shield,
  Sneaker,
  Sword,
  X,
  type Icon,
} from "@phosphor-icons/react";
import { ItemTypeChip } from "@/components/ui/ItemTypeChip";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import {
  V2_EQUIPMENT,
  equipmentPowerDisplayValue,
  v2EquipPowerLabel,
  v2EquipStatRows,
  type V2EquipSlot,
} from "@/adventure/data/v2/v2Equipment";
import {
  EquipmentTierBadge,
  EnhanceLevelBadge,
  QualityPctText,
  UniqueBadge,
  powerNameClass,
} from "@/adventure/v2/V2ItemCard";
import { NecklaceIcon, RingIcon } from "@/adventure/v2/EquipmentSlotIcons";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { useModalA11y } from "@/lib/useModalA11y";
import {
  ENCHANTMENT_EQUIPMENT_SLOT_TABS,
  enchantmentCandidateCounts,
  filterAndSortLiberationCandidates,
  formatLiberationOptionRoll,
  type EnchantmentEquipmentSortMode,
  type EnchantmentEquipmentSlotFilter,
  type LiberationCandidateRow,
} from "./equipmentLiberationViewModel";

const SLOT_ICON: Record<V2EquipSlot, { Icon: Icon; color: string }> = {
  weapon: { Icon: Sword, color: "text-rose-500" },
  armor: { Icon: Shield, color: "text-sky-500" },
  gloves: { Icon: HandFist, color: "text-amber-500" },
  boots: { Icon: Sneaker, color: "text-emerald-500" },
  ring: { Icon: RingIcon, color: "text-violet-500" },
  necklace: { Icon: NecklaceIcon, color: "text-pink-500" },
};

const SORT_OPTIONS: readonly {
  key: EnchantmentEquipmentSortMode;
  label: string;
}[] = [
  { key: "default", label: "기본 · 장착 우선" },
  { key: "acquired", label: "최근 획득 · 최신부터" },
  { key: "tier", label: "티어 · 높은순" },
  { key: "roll", label: "품질 · 높은순" },
  { key: "power", label: "위력 · 높은순" },
  { key: "enchantment", label: "마법부여 단계 · 높은순" },
];

function baseStatSummary(candidate: LiberationCandidateRow): string {
  const instance = candidate.item;
  const item = V2_EQUIPMENT[instance.id];
  const powerLabel = v2EquipPowerLabel(item);
  return v2EquipStatRows(
    item,
    instance.roll,
    instance.enhance,
    instance.craftQuality,
  )
    .filter((row) => row.label !== powerLabel && row.label !== "무게")
    .slice(0, 4)
    .map((row) => `${row.label} ${row.value}`)
    .join(" · ");
}

function EquipmentCandidateCard({
  candidate,
  selected,
  busy,
  onSelect,
}: {
  candidate: LiberationCandidateRow;
  selected: boolean;
  busy: boolean;
  onSelect: (iid: string) => void;
}) {
  const instance = candidate.item;
  const item = V2_EQUIPMENT[instance.id];
  const { Icon, color } = SLOT_ICON[candidate.slot];
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      disabled={busy}
      onClick={() => onSelect(candidate.iid)}
      className={`${SURFACE_INSET} ui-equipment-card ui-item-rarity-t${item.tier} ui-game-card ui-lift-card relative flex min-h-40 flex-col gap-1.5 rounded-xl p-3 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:cursor-wait disabled:opacity-50 ${
        selected
          ? "border-violet-500 ring-2 ring-violet-200 dark:border-violet-400 dark:ring-violet-900"
          : "hover:border-violet-400 hover:bg-violet-50 dark:hover:border-violet-500 dark:hover:bg-violet-950"
      }`}
    >
      <span className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          <Icon size={20} weight="duotone" className={`shrink-0 ${color}`} aria-hidden />
          <span
            className={`truncate text-sm font-bold ${powerNameClass(
              item,
              instance.roll,
              instance.enhance,
              instance.craftQuality,
            )}`}
          >
            {candidate.name}
          </span>
          <ItemTypeChip item={item} />
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {instance.locked ? (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
              <Lock size={12} weight="fill" aria-hidden /> 잠금됨
            </span>
          ) : null}
          {selected ? (
            <CheckCircle size={18} weight="fill" className="text-violet-600" aria-label="현재 선택" />
          ) : null}
        </span>
      </span>

      <span className="flex flex-wrap items-center gap-1 text-[11px]">
        <EquipmentTierBadge tier={item.tier} compact />
        {item.rarity === "unique" ? <UniqueBadge /> : null}
        <EnhanceLevelBadge enhance={instance.enhance} />
        {candidate.isEquipped ? (
          <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            장착 중
          </span>
        ) : null}
      </span>

      <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-zinc-700 dark:text-zinc-200">
        <span className="tabular-nums">
          위력 {equipmentPowerDisplayValue(candidate.effectivePower)}
        </span>
        {candidate.qualityPct != null ? (
          <span className="tabular-nums">
            품질 <QualityPctText pct={candidate.qualityPct} />
          </span>
        ) : (
          <span className="text-zinc-400">품질 고정</span>
        )}
      </span>

      <span className="line-clamp-2 min-h-8 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
        {baseStatSummary(candidate) || "추가 기본 옵션 없음"}
      </span>

      {instance.liberation ? (
        <span className="mt-auto block rounded-lg border border-violet-200 bg-white p-2 dark:border-violet-800 dark:bg-zinc-950">
          <span className="block text-[11px] font-bold text-violet-700 dark:text-violet-300">
            마법부여 {candidate.stage}단계 · {candidate.lineCount}줄
          </span>
          <span className="mt-1 block space-y-0.5">
            {instance.liberation.options.map((option) => (
              <span key={option.id} className="flex items-center justify-between gap-2 text-[11px]">
                <strong className="min-w-0 truncate text-zinc-800 dark:text-zinc-100">
                  {formatLiberationOptionRoll(option)}
                </strong>
                <span className="shrink-0 font-semibold tabular-nums text-violet-600 dark:text-violet-300">
                  Lv.{option.level}
                </span>
              </span>
            ))}
          </span>
        </span>
      ) : (
        <span className="mt-auto rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400">
          미마법부여
        </span>
      )}
    </button>
  );
}

export function EquipmentEnchantmentPickerDialog({
  candidates,
  selectedIid,
  busy,
  onSelect,
  onClose,
}: {
  candidates: readonly LiberationCandidateRow[];
  selectedIid: string;
  busy: boolean;
  onSelect: (iid: string) => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [slot, setSlot] = useState<EnchantmentEquipmentSlotFilter>("all");
  const [sort, setSort] = useState<EnchantmentEquipmentSortMode>("default");
  const closeIfIdle = useCallback(() => {
    if (!busy) onClose();
  }, [busy, onClose]);
  const counts = useMemo(() => enchantmentCandidateCounts(candidates), [candidates]);
  const filtered = useMemo(
    () => filterAndSortLiberationCandidates(candidates, { query, slot, sort }),
    [candidates, query, slot, sort],
  );

  useEscapeKey(closeIfIdle);
  useModalA11y(panelRef);

  return (
    <div
      className="ui-modal-reveal fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) closeIfIdle();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="equipment-enchantment-picker-title"
        className={`${SURFACE_CARD} ui-modal-panel flex max-h-[min(92vh,900px)] w-full max-w-3xl flex-col p-4 shadow-2xl sm:p-5`}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-violet-700 dark:text-violet-300">
              마법부여 대상 변경
            </p>
            <h2 id="equipment-enchantment-picker-title" className="mt-0.5 text-lg font-bold">
              마법부여 장비 선택
            </h2>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              품질과 옵션을 비교한 뒤 카드를 선택하세요.
            </p>
          </div>
          <button
            type="button"
            onClick={closeIfIdle}
            disabled={busy}
            aria-label="장비 선택 닫기"
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            <X size={18} weight="bold" aria-hidden />
          </button>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_13rem]">
          <label className="relative block">
            <MagnifyingGlass
              size={16}
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="장비 이름 검색"
              placeholder="장비 이름 검색"
              className="min-h-11 w-full rounded-lg border border-zinc-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-violet-400 dark:focus:ring-violet-900"
            />
          </label>
          <select
            aria-label="장비 정렬 기준"
            value={sort}
            onChange={(event) => setSort(event.currentTarget.value as EnchantmentEquipmentSortMode)}
            className="min-h-11 rounded-lg border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-800 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-violet-400 dark:focus:ring-violet-900"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div
          role="tablist"
          aria-label="장비 부위"
          className="mt-3 flex gap-1 overflow-x-auto pb-1"
        >
          {ENCHANTMENT_EQUIPMENT_SLOT_TABS.map((tab) => {
            const active = slot === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSlot(tab.key)}
                className={`min-h-9 shrink-0 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  active
                    ? "border-violet-500 bg-violet-600 text-white shadow-sm dark:border-violet-400 dark:bg-violet-500"
                    : "border-zinc-300 bg-white text-zinc-700 hover:border-violet-400 hover:text-violet-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:border-violet-500 dark:hover:text-violet-300"
                }`}
              >
                {tab.label} {counts[tab.key]}
              </button>
            );
          })}
        </div>

        <div
          className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1"
          role="listbox"
          aria-label="마법부여 대상 장비"
        >
          {filtered.length > 0 ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {filtered.map((candidate) => (
                <EquipmentCandidateCard
                  key={candidate.iid}
                  candidate={candidate}
                  selected={candidate.iid === selectedIid}
                  busy={busy}
                  onSelect={onSelect}
                />
              ))}
            </div>
          ) : (
            <p className={`${SURFACE_INSET} p-6 text-center text-sm text-zinc-500 dark:text-zinc-400`}>
              조건에 맞는 장비가 없습니다.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
