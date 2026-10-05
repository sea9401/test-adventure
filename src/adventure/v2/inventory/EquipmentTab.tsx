"use client";

import { useId, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { CaretDown } from "@phosphor-icons/react";
import { Pagination } from "@/components/ui/Pagination";
import { Button } from "@/components/ui/Button";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import { usePagination } from "@/lib/usePagination";
import {
  type V2EquipInstance,
  type V2EquipSlot,
} from "@/adventure/data/v2/v2Equipment";
import {
  selectBulkSell,
  type BulkSellOpts,
} from "@/adventure/data/v2/v2EquipVariance";
import { type ItemCardAnchor } from "../V2ItemCard";
import {
  V2_ITEM_TABS,
  sortEquipInstances,
  type SortMode,
} from "../v2ItemListShared";
import { EquipmentCardGrid } from "./EquipmentCardGrid";
import { matchesEquipmentSearch } from "../itemSearch";

export type EquipmentLockFilter = "all" | "locked" | "unlocked";

// 버튼을 누를 때마다 전체 → 잠금만 → 미잠금만 → 전체 순서로 바뀐다.
const NEXT_LOCK_FILTER: Record<EquipmentLockFilter, EquipmentLockFilter> = {
  all: "locked",
  locked: "unlocked",
  unlocked: "all",
};

export type EquipmentSaleSelection = {
  active: boolean;
  selectedIids: ReadonlySet<string>;
  selectedCount: number;
  selectedGold: number;
  onStart: () => void;
  onCancel: () => void;
  onToggle: (inst: V2EquipInstance) => void;
  onConfirm: () => void;
};

const INVENTORY_SORT_OPTIONS: ReadonlyArray<{
  key: SortMode;
  label: string;
}> = [
  { key: "default", label: "기본 · 종류별" },
  { key: "acquired", label: "최근 획득 · 최신부터" },
  { key: "tier", label: "티어 · 높은순" },
  { key: "roll", label: "품질 · 높은순" },
  { key: "power", label: "위력 · 높은순" },
  { key: "locked", label: "잠금 우선 · 잠금부터" },
];

// 장비 슬롯 탭(무기/갑옷/장갑/신발/반지/목걸이) — 일괄 판매 컨트롤 + 정렬 버튼 +
// 보유 장비 카드 그리드 + 페이지네이션. 정렬·일괄판매 임계값 상태는 코디네이터(부모)가
// 보유하고, 탭-로컬 정렬/페이지네이션만 여기서 파생한다(거동 불변).
export function EquipmentTab({
  search = "",
  slot,
  instances,
  equippedIid,
  busy,
  sortMode,
  setSortMode,
  lockFilter,
  setLockFilter,
  sellQualityPct,
  setSellQualityPct,
  pageSize,
  frontierDepth,
  onBulkSell,
  onOpenCard,
  onRegisterCodex,
  codexBulk,
  selection,
}: {
  search?: string;
  slot: V2EquipSlot;
  instances: V2EquipInstance[];
  equippedIid: string | null;
  busy: string | null;
  sortMode: SortMode;
  setSortMode: Dispatch<SetStateAction<SortMode>>;
  lockFilter: EquipmentLockFilter;
  setLockFilter: (next: EquipmentLockFilter) => void;
  sellQualityPct: number;
  setSellQualityPct: Dispatch<SetStateAction<number>>;
  pageSize: number;
  frontierDepth: number;
  onBulkSell: (opts: BulkSellOpts, label: string) => void;
  onOpenCard: (inst: V2EquipInstance, anchor: ItemCardAnchor) => void;
  onRegisterCodex: (inst: V2EquipInstance) => void;
  codexBulk?: {
    registerableCount: number;
    onStart: () => void;
  };
  selection: EquipmentSaleSelection;
}) {
  const tabLabel = V2_ITEM_TABS.find((t) => t.key === slot)?.label ?? "";
  const [bulkOpen, setBulkOpen] = useState(false);
  const bulkPanelId = useId();

  const sortedInstances: V2EquipInstance[] = useMemo(
    () => sortEquipInstances(instances, sortMode),
    [instances, sortMode],
  );
  const tabInstances = useMemo(
    () =>
      sortedInstances.filter((instance) =>
        (lockFilter === "all" || (instance.locked === true) === (lockFilter === "locked")) &&
        matchesEquipmentSearch(instance.id, search),
      ),
    [lockFilter, sortedInstances, search],
  );
  const lockedCount = useMemo(
    () => instances.filter((instance) => instance.locked === true).length,
    [instances],
  );

  // 목록이 길어지면 페이지로 나눈다(한 페이지 20개). 탭(슬롯)·정렬을 바꾸면 1페이지로 리셋
  //   (resetKey).
  const equipPager = usePagination(
    tabInstances,
    pageSize,
    `${slot}:${sortMode}:${lockFilter}:${search}`,
  );
  const qualitySellCount = useMemo(
    () =>
      selectBulkSell(
        instances,
        equippedIid ? { [slot]: equippedIid } : {},
        { slot, belowPct: sellQualityPct },
      ).count,
    [equippedIid, instances, sellQualityPct, slot],
  );

  return (
    <>
      {instances.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <select
              aria-label="장비 정렬 기준"
              value={sortMode}
              onChange={(event) =>
                setSortMode(event.currentTarget.value as SortMode)
              }
              className="min-h-10 min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white py-1 pl-2 pr-7 text-sm font-semibold text-zinc-800 [color-scheme:light] outline-none focus:ring-2 focus:ring-focus sm:min-h-9 sm:flex-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:[color-scheme:dark]"
            >
              {INVENTORY_SORT_OPTIONS.map((option) => (
                <option
                  key={option.key}
                  value={option.key}
                  className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100"
                >
                  {option.label}
                </option>
              ))}
            </select>
            <Button
              type="button"
              onClick={() => setLockFilter(NEXT_LOCK_FILTER[lockFilter])}
              aria-pressed={lockFilter !== "all"}
              variant={lockFilter !== "all" ? "primary" : "secondary"}
              size="sm"
              className="shrink-0"
            >
              {lockFilter === "unlocked"
                ? `미잠금만 보기 (${instances.length - lockedCount})`
                : `잠금만 보기 (${lockedCount})`}
            </Button>
          </div>
          {selection.active ? (
            <p className="text-sm font-medium text-rose-600 dark:text-rose-300">
              판매할 장비를 선택하세요
            </p>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              aria-expanded={bulkOpen}
              aria-controls={bulkPanelId}
              onClick={() => setBulkOpen((open) => !open)}
            >
              일괄 작업
              <CaretDown
                size={14}
                aria-hidden
                className={`transition-transform ${bulkOpen ? "rotate-180" : ""}`}
              />
            </Button>
          )}
          {/* 일괄 작업 — 현재 탭 부위 전체 대상, 장착·잠금 장비는 제외(전 장비 판매 가능) */}
          {bulkOpen && !selection.active ? (
            <section
              id={bulkPanelId}
              aria-label="일괄 작업"
              className={`${SURFACE_INSET} space-y-3 p-3 text-sm`}
            >
              {search.trim() ? (
                <p className="text-xs text-zinc-600 dark:text-zinc-300">
                  일괄 판매·도감 일괄 등록은 검색 결과와 관계없이 현재 부위 전체에 적용됩니다. 찾은
                  장비만 팔려면 선택 판매를 이용해 주세요.
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {codexBulk ? (
                  <Button
                    onClick={codexBulk.onStart}
                    disabled={busy !== null || codexBulk.registerableCount === 0}
                    size="sm"
                  >
                    도감 일괄 등록 ({codexBulk.registerableCount})
                  </Button>
                ) : null}
                <Button onClick={selection.onStart} disabled={busy !== null} size="sm">
                  선택 판매
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-700">
                {/* 품질 임계값 직접 설정(0~100). 이 값 이하 품질만 일괄 판매. */}
                <label className="flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-300">
                  품질
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={100}
                    value={sellQualityPct}
                    onFocus={(event) => event.currentTarget.select()}
                    onChange={(event) => {
                      const value = Number(event.currentTarget.value);
                      setSellQualityPct(
                        Number.isFinite(value)
                          ? Math.max(0, Math.min(100, Math.floor(value)))
                          : 0,
                      );
                    }}
                    aria-label="일괄 판매 품질 임계값(%)"
                    className="min-h-10 w-14 rounded-lg border border-zinc-300 bg-white px-2 text-right text-sm tabular-nums text-zinc-700 [appearance:textfield] sm:min-h-9 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
                  />
                  %
                </label>
                <Button
                  onClick={() =>
                    onBulkSell(
                      { slot, belowPct: sellQualityPct },
                      `${tabLabel} 품질 ${sellQualityPct}% 이하`,
                    )
                  }
                  disabled={busy !== null || qualitySellCount === 0}
                  variant="danger"
                  size="sm"
                >
                  이하 판매 ({qualitySellCount})
                </Button>
                <Button
                  onClick={() =>
                    onBulkSell({ slot }, `${tabLabel} 미장착 전부`)
                  }
                  disabled={busy !== null}
                  variant="danger"
                  size="sm"
                >
                  미장착 전부 판매
                </Button>
              </div>
            </section>
          ) : null}
        </div>
      )}
      <EquipmentCardGrid
        cards={equipPager.pageItems.map((inst) => ({
          inst,
          isEquipped: equippedIid === inst.iid,
        }))}
        onOpenCard={onOpenCard}
        onRegisterCodex={onRegisterCodex}
        codexBusyIid={busy}
        saleSelection={{
          active: selection.active,
          selectedIids: selection.selectedIids,
          onToggle: selection.onToggle,
        }}
        recentlyAcquiredIid={
          sortMode === "acquired" ? tabInstances[0]?.iid : undefined
        }
        frontierDepth={frontierDepth}
        emptyState={
          search.trim()
            ? { title: "검색 결과가 없습니다", message: "다른 이름으로 검색하거나 검색어를 지워 주세요." }
            : lockFilter === "locked"
            ? {
                title: "잠근 장비가 없습니다",
                message:
                  "장비 상세에서 잠금을 설정하면 여기에 모아 볼 수 있습니다.",
              }
            : lockFilter === "unlocked"
            ? { title: "잠그지 않은 장비가 없습니다", message: "이 부위의 장비는 모두 잠겨 있습니다." }
            : undefined
        }
      />
      {selection.active ? (
        <div
          className={`${SURFACE_CARD} sticky bottom-2 z-20 flex flex-wrap items-center justify-between gap-2 p-2.5`}
          aria-live="polite"
        >
          <div className="text-sm text-zinc-700 dark:text-zinc-200">
            <span className="font-semibold">선택 {selection.selectedCount}개</span>
            <span className="mx-1.5 text-zinc-400">·</span>
            예상 <span className="font-semibold tabular-nums">{selection.selectedGold.toLocaleString()}골드</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              onClick={selection.onCancel}
              disabled={busy !== null}
              variant="secondary"
              size="sm"
            >
              취소
            </Button>
            <Button
              onClick={selection.onConfirm}
              disabled={busy !== null || selection.selectedCount === 0}
              variant="danger"
              size="sm"
            >
              {busy === "selected-sell" ? "판매 중…" : "선택 판매"}
            </Button>
          </div>
        </div>
      ) : null}
      <Pagination
        page={equipPager.page}
        pageCount={equipPager.pageCount}
        setPage={equipPager.setPage}
      />
    </>
  );
}
