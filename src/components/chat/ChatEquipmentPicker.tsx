"use client";

import { useEffect, useMemo, useState } from "react";
import { MagnifyingGlass, Package, X } from "@phosphor-icons/react";
import { Pagination } from "@/components/ui/Pagination";
import { SURFACE_INSET } from "@/components/ui/surfaces";
import { usePagination } from "@/lib/usePagination";
import { useEscapeKey } from "@/lib/useEscapeKey";
import {
  V2_EQUIPMENT,
  V2_SLOT_LABEL,
  v2EquipStatRows,
  type V2EquipInstance,
  type V2EquipSlot,
} from "@/adventure/data/v2/v2Equipment";
import { rollQualityPct } from "@/adventure/data/v2/v2EquipVariance";
import {
  CraftQualityBadge,
  EnhanceLevelBadge,
  EquipmentTierBadge,
  MasterworkBadge,
  QualityPctText,
  powerNameClass,
} from "@/adventure/v2/V2ItemCard";
import { EquipmentCodexBadge } from "@/adventure/v2/EquipmentCodexBadge";

type SlotFilter = "all" | V2EquipSlot;

const SLOT_FILTERS: ReadonlyArray<{ key: SlotFilter; label: string }> = [
  { key: "all", label: "전체" },
  { key: "weapon", label: "무기" },
  { key: "armor", label: "갑옷" },
  { key: "gloves", label: "장갑" },
  { key: "boots", label: "신발" },
  { key: "ring", label: "반지" },
  { key: "necklace", label: "목걸이" },
];

const SLOT_ORDER: V2EquipSlot[] = [
  "weapon",
  "armor",
  "gloves",
  "boots",
  "ring",
  "necklace",
];

export function ChatEquipmentPicker({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (instance: V2EquipInstance) => void;
}) {
  const [owned, setOwned] = useState<V2EquipInstance[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slot, setSlot] = useState<SlotFilter>("all");
  const [query, setQuery] = useState("");
  useEscapeKey(onClose);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 대화상자를 열 때 최신 인벤토리를 조회한다.
    setLoading(true);
    setError(null);
    void fetch("/api/v2/me/equipment", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("equipment fetch failed");
        const body = (await response.json()) as { owned?: unknown };
        setOwned(Array.isArray(body.owned) ? (body.owned as V2EquipInstance[]) : []);
      })
      .catch((reason: unknown) => {
        if ((reason as { name?: string })?.name !== "AbortError") {
          setError("장비 목록을 불러오지 못했어요.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [open]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("ko-KR");
    return [...owned]
      .filter((instance) => {
        const item = V2_EQUIPMENT[instance.id];
        return (
          (slot === "all" || item.slot === slot) &&
          (!normalizedQuery ||
            item.name.toLocaleLowerCase("ko-KR").includes(normalizedQuery))
        );
      })
      .sort((left, right) => {
        const a = V2_EQUIPMENT[left.id];
        const b = V2_EQUIPMENT[right.id];
        return (
          SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot) ||
          b.tier - a.tier ||
          a.name.localeCompare(b.name, "ko") ||
          left.iid.localeCompare(right.iid)
        );
      });
  }, [owned, query, slot]);
  const pager = usePagination(filtered, 12, `${slot}:${query}`);

  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-label="채팅에 첨부할 장비 선택"
      className="absolute inset-0 z-30 flex flex-col bg-white dark:bg-zinc-950"
    >
      <header className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div>
          <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
            채팅에 장비 링크
          </h2>
          <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
            보유 장비를 선택하면 현재 옵션이 메시지에 첨부됩니다.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="장비 선택 닫기"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          <X size={18} weight="bold" />
        </button>
      </header>

      <div className="space-y-2 border-b border-zinc-200 p-3 dark:border-zinc-800">
        <label className="relative block">
          <MagnifyingGlass
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="장비 이름 검색"
            className="h-10 w-full rounded-lg border border-zinc-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-sky-500 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <div className="no-scrollbar flex gap-1 overflow-x-auto">
          {SLOT_FILTERS.map((filter) => (
            <button
              key={filter.key}
              type="button"
              aria-pressed={slot === filter.key}
              onClick={() => setSlot(filter.key)}
              className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                slot === filter.key
                  ? "bg-sky-600 text-white"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      <div className="no-scrollbar flex-1 overflow-y-auto p-3">
        {loading ? (
          <div className="flex h-full items-center justify-center text-sm text-zinc-500">
            장비를 불러오는 중…
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center text-sm text-rose-600 dark:text-rose-300">
            {error}
          </div>
        ) : pager.pageItems.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-zinc-400 dark:text-zinc-500">
            <Package size={34} weight="duotone" />
            <span className="text-sm">
              {owned.length === 0
                ? "보유한 장비가 없습니다."
                : "검색 조건에 맞는 장비가 없습니다."}
            </span>
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {pager.pageItems.map((instance) => {
              const item = V2_EQUIPMENT[instance.id];
              const quality = rollQualityPct(item, instance.roll);
              const stats = v2EquipStatRows(
                item,
                instance.roll,
                instance.enhance,
                instance.craftQuality,
              )
                .map((row) => `${row.label} ${row.value}`)
                .join(" · ");
              return (
                <button
                  key={instance.iid}
                  type="button"
                  onClick={() => onSelect(instance)}
                  className={`${SURFACE_INSET} min-w-0 p-3 text-left transition hover:border-sky-400 hover:bg-sky-50 dark:hover:border-sky-700 dark:hover:bg-sky-950`}
                >
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span
                      className={`truncate text-sm font-semibold ${powerNameClass(
                        item,
                        instance.roll,
                        instance.enhance,
                        instance.craftQuality,
                      )}`}
                    >
                      {item.name}
                    </span>
                    {quality != null ? (
                      <QualityPctText pct={quality} className="text-[11px]" />
                    ) : null}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    <EquipmentTierBadge tier={item.tier} compact />
                    <EquipmentCodexBadge itemId={item.id} />
                    <EnhanceLevelBadge enhance={instance.enhance} />
                    <CraftQualityBadge craftQuality={instance.craftQuality} />
                    {instance.craftedBy?.masterwork ? <MasterworkBadge /> : null}
                  </div>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
                    {V2_SLOT_LABEL[item.slot]} · {stats || "옵션 없음"}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </div>
      {!loading && !error && filtered.length > 0 ? (
        <div className="border-t border-zinc-200 px-3 py-2 dark:border-zinc-800">
          <Pagination
            page={pager.page}
            pageCount={pager.pageCount}
            setPage={pager.setPage}
          />
        </div>
      ) : null}
    </div>
  );
}
