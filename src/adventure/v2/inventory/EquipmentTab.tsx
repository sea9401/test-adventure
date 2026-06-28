"use client";

import { useMemo, type Dispatch, type SetStateAction } from "react";
import { Pagination } from "@/components/ui/Pagination";
import { Button } from "@/components/ui/Button";
import { usePagination } from "@/lib/usePagination";
import {
  type V2EquipInstance,
  type V2EquipSlot,
} from "@/adventure/data/v2/v2Equipment";
import { type BulkSellOpts } from "@/adventure/data/v2/v2EquipVariance";
import { type ItemCardAnchor } from "../V2ItemCard";
import {
  V2_ITEM_TABS,
  nextSortMode,
  sortModeLabel,
  sortEquipInstances,
  type SortMode,
} from "../v2ItemListShared";
import { EquipmentCardGrid } from "./EquipmentCardGrid";

// 장비 슬롯 탭(무기/갑옷/장갑/신발/반지/목걸이) — 일괄 판매 컨트롤 + 정렬 버튼 +
// 보유 장비 카드 그리드 + 페이지네이션. 정렬·일괄판매 임계값 상태는 코디네이터(부모)가
// 보유하고, 탭-로컬 정렬/페이지네이션만 여기서 파생한다(거동 불변).
export function EquipmentTab({
  slot,
  instances,
  equippedIid,
  busy,
  sortMode,
  setSortMode,
  sellQualityPct,
  setSellQualityPct,
  pageSize,
  onBulkSell,
  onOpenCard,
}: {
  slot: V2EquipSlot;
  instances: V2EquipInstance[];
  equippedIid: string | null;
  busy: string | null;
  sortMode: SortMode;
  setSortMode: Dispatch<SetStateAction<SortMode>>;
  sellQualityPct: number;
  setSellQualityPct: Dispatch<SetStateAction<number>>;
  pageSize: number;
  onBulkSell: (opts: BulkSellOpts, label: string) => void;
  onOpenCard: (inst: V2EquipInstance, anchor: ItemCardAnchor) => void;
}) {
  const tabLabel = V2_ITEM_TABS.find((t) => t.key === slot)?.label ?? "";

  const tabInstances: V2EquipInstance[] = useMemo(
    () => sortEquipInstances(instances, sortMode),
    [instances, sortMode],
  );

  // 목록이 길어지면 페이지로 나눈다(한 페이지 20개). 탭(슬롯)·정렬을 바꾸면 1페이지로 리셋
  //   (resetKey).
  const equipPager = usePagination(
    tabInstances,
    pageSize,
    `${slot}:${sortMode}`,
  );

  return (
    <>
      {tabInstances.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* 정리(일괄 판매) — 현재 탭 슬롯, 장착·잠금만 제외(전 장비 판매 가능) */}
          <div className="flex items-center gap-1">
            <span className="mr-0.5 text-[11px] text-zinc-400 dark:text-zinc-500">
              정리
            </span>
            {/* 품질 임계값 직접 설정(0~100). 이 값 이하 품질만 일괄 판매. */}
            <label className="flex items-center gap-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
              품질
              <input
                type="number"
                min={0}
                max={100}
                value={sellQualityPct}
                onChange={(e) =>
                  setSellQualityPct(
                    Math.max(
                      0,
                      Math.min(100, Math.floor(Number(e.target.value) || 0)),
                    ),
                  )
                }
                aria-label="일괄 판매 품질 임계값(%)"
                className="w-11 rounded border border-zinc-300 bg-white px-1 py-0.5 text-right tabular-nums text-zinc-700 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
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
              disabled={busy !== null}
              variant="warning"
              size="xs"
              className="min-h-0 px-2 py-0.5 text-[11px]"
            >
              이하 판매
            </Button>
            <Button
              onClick={() => onBulkSell({ slot }, `${tabLabel} 미장착 전부`)}
              disabled={busy !== null}
              variant="danger"
              size="xs"
              className="min-h-0 px-2 py-0.5 text-[11px]"
            >
              미장착 전부 판매
            </Button>
          </div>
          {/* 정렬 — 단일 버튼, 누를 때마다 순환(기본 → 품질순 → 위력순). */}
          <Button
            title="누를 때마다 정렬 전환 (기본 → 품질순 → 위력순)"
            onClick={() => setSortMode((m) => nextSortMode(m))}
            variant="secondary"
            size="xs"
            className="min-h-0 px-2.5 py-0.5 text-[11px]"
          >
            정렬 ⇅ {sortModeLabel(sortMode)}
          </Button>
        </div>
      )}
      <EquipmentCardGrid
        cards={equipPager.pageItems.map((inst) => ({
          inst,
          isEquipped: equippedIid === inst.iid,
        }))}
        onOpenCard={onOpenCard}
      />
      <Pagination
        page={equipPager.page}
        pageCount={equipPager.pageCount}
        setPage={equipPager.setPage}
      />
    </>
  );
}
