"use client";

import { useMemo, useState } from "react";
import {
  ArrowsDownUp,
  CaretDown,
  CaretRight,
  Crown,
  Lock,
} from "@phosphor-icons/react";
import { EmptyState } from "@/components/ui/EmptyState";
import { Card } from "@/components/ui/Card";
import {
  COUNTER_TITLES,
  TITLES,
  TITLE_CATEGORY_ORDER,
  type Title,
  type TitleCategory,
  type TitleId,
} from "@/adventure/data/titles";
import type { AdventureLog } from "@/adventure/log/storage";
import type { TitleCounterValues } from "./shared";

// 도감에는 정의된 모든 칭호를 잠금/획득 상태로 표시 — 그 중 획득(log.titles 등록)된
// 칭호만 장착/해제 가능. 한 번에 한 개만 장착 (equippedTitleId).
// 카테고리별 collapsible 섹션으로 묶어 노출. 최초 마운트 때 획득분이 1개라도 있는
// 카테고리는 펼친 상태로 시작 — 나머진 접힘.
export function TitlesTab({
  log,
  equippedTitleId,
  onEquipTitle,
  titleCounters,
}: {
  log: AdventureLog;
  equippedTitleId: string | null;
  onEquipTitle?: (titleId: TitleId | null) => void;
  titleCounters: TitleCounterValues;
}) {
  // 획득 칭호 정렬 — 클릭 시 토글. 기본값 recent (가장 최근 획득 위).
  const [sortMode, setSortMode] = useState<"recent" | "abc">("recent");

  // 카테고리별 펼침 상태 — 초기엔 획득분이 있는 카테고리만 열린 상태.
  const [openCategories, setOpenCategories] = useState<Set<TitleCategory>>(
    () => {
      const set = new Set<TitleCategory>();
      for (const cat of TITLE_CATEGORY_ORDER) {
        const hasObtained = Object.values(TITLES).some(
          (t) => t.category === cat.id && !!log.titles[t.id],
        );
        if (hasObtained) set.add(cat.id);
      }
      return set;
    },
  );

  // 카테고리별로 obtained/locked 버킷에 나누고, obtained 는 sortMode 적용.
  const grouped = useMemo(() => {
    const byCategory = new Map<
      TitleCategory,
      { obtained: Title[]; locked: Title[] }
    >();
    for (const cat of TITLE_CATEGORY_ORDER) {
      byCategory.set(cat.id, { obtained: [], locked: [] });
    }
    for (const t of Object.values(TITLES)) {
      const bucket = byCategory.get(t.category);
      if (!bucket) continue;
      if (log.titles[t.id]) bucket.obtained.push(t);
      else bucket.locked.push(t);
    }
    for (const bucket of byCategory.values()) {
      if (sortMode === "abc") {
        bucket.obtained.sort((a, b) => a.name.localeCompare(b.name, "ko"));
      } else {
        bucket.obtained.sort(
          (a, b) =>
            (log.titles[b.id]?.obtainedAt ?? 0) -
            (log.titles[a.id]?.obtainedAt ?? 0),
        );
      }
    }
    return byCategory;
  }, [sortMode, log.titles]);

  const totalObtained = useMemo(
    () => Object.values(TITLES).filter((t) => !!log.titles[t.id]).length,
    [log.titles],
  );
  const totalAll = Object.keys(TITLES).length;

  if (totalAll === 0) {
    return (
      <EmptyState
        icon={<Crown size={40} weight="duotone" />}
        title="아직 정의된 칭호가 없습니다"
        message="추후 업데이트로 추가될 예정입니다."
      />
    );
  }

  const toggleCategory = (id: TitleCategory) =>
    setOpenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const renderCard = (title: Title) => {
    const entry = log.titles[title.id];
    const isObtained = !!entry;
    const isEquipped = equippedTitleId === title.id;
    // 카운터형 칭호: 미획득 상태에서도 절반 도달 시 조건만 미리 공개.
    const counter = COUNTER_TITLES.find((c) => c.id === title.id);
    const counterValue = counter ? (titleCounters[counter.key] ?? 0) : 0;
    const conditionRevealed =
      !isObtained && !!counter && counterValue >= counter.target / 2;
    return (
      <Card key={title.id}>
        <div className="flex items-baseline justify-between gap-2">
          <span className="flex items-baseline gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {isObtained ? (
              title.name
            ) : (
              <span className="flex items-center gap-1 italic text-zinc-400 dark:text-zinc-500">
                <Lock size={12} weight="duotone" />
                ???
              </span>
            )}
            {isEquipped && (
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-normal text-emerald-700 dark:text-emerald-400">
                장착중
              </span>
            )}
          </span>
          {isObtained && entry && (
            <span className="shrink-0 text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
              {new Date(entry.obtainedAt).toLocaleDateString()}
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
          {isObtained ? (
            title.description
          ) : conditionRevealed ? (
            <span className="text-zinc-500 dark:text-zinc-400">
              달성 조건 — {title.condition} ({counterValue}/{counter!.target})
            </span>
          ) : (
            <span className="italic text-zinc-400 dark:text-zinc-500">
              달성 조건 ???
            </span>
          )}
        </p>
        {isObtained && onEquipTitle && (
          <button
            type="button"
            onClick={() =>
              onEquipTitle(isEquipped ? null : (title.id as TitleId))
            }
            className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            {isEquipped ? "해제" : "장착"}
          </button>
        )}
      </Card>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
          획득한 칭호 ({totalObtained} / {totalAll})
        </h3>
        {totalObtained > 1 && (
          <button
            type="button"
            onClick={() =>
              setSortMode((m) => (m === "recent" ? "abc" : "recent"))
            }
            aria-label={
              sortMode === "recent" ? "ABC 순으로 정렬" : "최근 획득순으로 정렬"
            }
            className="inline-flex items-center gap-1 rounded-md border border-zinc-300 bg-white px-2 py-0.5 text-[11px] font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <ArrowsDownUp size={11} weight="bold" />
            {sortMode === "recent" ? "최근 획득순" : "ABC 순"}
          </button>
        )}
      </div>

      {TITLE_CATEGORY_ORDER.map((cat) => {
        const bucket = grouped.get(cat.id);
        if (!bucket) return null;
        const total = bucket.obtained.length + bucket.locked.length;
        if (total === 0) return null;
        const isOpen = openCategories.has(cat.id);
        return (
          <section key={cat.id}>
            <button
              type="button"
              onClick={() => toggleCategory(cat.id)}
              aria-expanded={isOpen}
              className="mb-2 flex w-full items-center gap-1.5 text-xs font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
            >
              {isOpen ? (
                <CaretDown size={12} weight="bold" />
              ) : (
                <CaretRight size={12} weight="bold" />
              )}
              <span>{cat.label}</span>
              <span className="tabular-nums text-zinc-400 dark:text-zinc-500">
                ({bucket.obtained.length} / {total})
              </span>
            </button>
            {isOpen && (
              <div className="space-y-2">
                {bucket.obtained.map(renderCard)}
                {bucket.locked.map(renderCard)}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
