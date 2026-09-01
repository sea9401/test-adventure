"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import {
  JOB_MANUAL_LINE_LABELS,
  type JobManualIndexEntry,
  type JobManualKind,
  type JobManualLine,
} from "../jobManualModel";

export type JobWikiFilters = {
  query: string;
  kind: "all" | JobManualKind;
  line: "all" | JobManualLine;
  tier: "all" | number;
};

const INITIAL_FILTERS: JobWikiFilters = {
  query: "",
  kind: "all",
  line: "all",
  tier: "all",
};

export const JOB_WIKI_PAGE_SIZE = 12;

export type JobWikiPage = {
  entries: JobManualIndexEntry[];
  currentPage: number;
  pageCount: number;
  startIndex: number;
  endIndex: number;
};

const KIND_OPTIONS: Array<{ value: JobWikiFilters["kind"]; label: string }> = [
  { value: "all", label: "전체" },
  { value: "combat", label: "전투" },
  { value: "life", label: "생활" },
];

const LINE_OPTIONS: Array<{ value: JobWikiFilters["line"]; label: string }> = [
  { value: "all", label: "전체" },
  ...Object.entries(JOB_MANUAL_LINE_LABELS).map(([value, label]) => ({
    value: value as JobManualLine,
    label,
  })),
];

const TIER_OPTIONS: Array<{ value: JobWikiFilters["tier"]; label: string }> = [
  { value: "all", label: "전체" },
  ...Array.from({ length: 8 }, (_, tier) => ({
    value: tier,
    label: tier === 0 ? "루트" : `${tier}차`,
  })),
];

function normalizeSearch(value: string): string {
  return value.trim().toLocaleLowerCase("ko-KR");
}

export function filterJobManualIndex(
  entries: readonly JobManualIndexEntry[],
  filters: JobWikiFilters,
): JobManualIndexEntry[] {
  const query = normalizeSearch(filters.query);
  return entries.filter(
    (entry) =>
      (!query || entry.searchText.includes(query)) &&
      (filters.kind === "all" || entry.kind === filters.kind) &&
      (filters.line === "all" || entry.line === filters.line) &&
      (filters.tier === "all" || entry.tier === filters.tier),
  );
}

export function paginateJobManualIndex(
  entries: readonly JobManualIndexEntry[],
  page: number,
): JobWikiPage {
  const pageCount = Math.max(1, Math.ceil(entries.length / JOB_WIKI_PAGE_SIZE));
  const currentPage = Math.min(
    Math.max(Number.isFinite(page) ? Math.trunc(page) : 1, 1),
    pageCount,
  );
  const offset = (currentPage - 1) * JOB_WIKI_PAGE_SIZE;
  const pageEntries = entries.slice(offset, offset + JOB_WIKI_PAGE_SIZE);
  return {
    entries: pageEntries,
    currentPage,
    pageCount,
    startIndex: pageEntries.length > 0 ? offset + 1 : 0,
    endIndex: offset + pageEntries.length,
  };
}

function FilterButton<T extends string | number>({
  active,
  label,
  value,
  onSelect,
}: {
  active: boolean;
  label: string;
  value: T;
  onSelect: (value: T) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={() => onSelect(value)}
      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
        active
          ? "border-amber-500 bg-amber-500 text-zinc-950"
          : "border-zinc-300 bg-white text-zinc-700 hover:border-amber-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
      }`}
    >
      {label}
    </button>
  );
}

function PaginationControls({
  currentPage,
  pageCount,
  onSelect,
}: {
  currentPage: number;
  pageCount: number;
  onSelect: (page: number) => void;
}) {
  if (pageCount <= 1) return null;
  return (
    <nav
      aria-label="직업 도감 페이지"
      className="mt-4 flex items-center justify-center gap-3"
    >
      <button
        type="button"
        aria-label="이전 페이지"
        disabled={currentPage === 1}
        onClick={() => onSelect(currentPage - 1)}
        className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:border-amber-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
      >
        이전
      </button>
      <span className="min-w-20 text-center text-sm font-semibold text-zinc-700 dark:text-zinc-300">
        {currentPage} / {pageCount} 페이지
      </span>
      <button
        type="button"
        aria-label="다음 페이지"
        disabled={currentPage === pageCount}
        onClick={() => onSelect(currentPage + 1)}
        className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:border-amber-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
      >
        다음
      </button>
    </nav>
  );
}

export function JobWikiIndex({ entries }: { entries: JobManualIndexEntry[] }) {
  const [filters, setFilters] = useState<JobWikiFilters>(INITIAL_FILTERS);
  const [page, setPage] = useState(1);
  const filteredEntries = useMemo(
    () => filterJobManualIndex(entries, filters),
    [entries, filters],
  );
  const pagination = useMemo(
    () => paginateJobManualIndex(filteredEntries, page),
    [filteredEntries, page],
  );
  const hasActiveFilter =
    filters.query.trim() !== "" ||
    filters.kind !== "all" ||
    filters.line !== "all" ||
    filters.tier !== "all";
  const updateFilters = (
    update: (current: JobWikiFilters) => JobWikiFilters,
  ) => {
    setFilters(update);
    setPage(1);
  };
  const reset = () => {
    setFilters(INITIAL_FILTERS);
    setPage(1);
  };

  return (
    <section className="mt-5" aria-label="전체 직업 도감 검색">
      <div className={`${SURFACE_INSET} space-y-4 p-4`}>
        <div>
          <label
            htmlFor="job-wiki-search"
            className="text-sm font-semibold text-zinc-900 dark:text-zinc-100"
          >
            직업 또는 스킬 검색
          </label>
          <input
            id="job-wiki-search"
            type="search"
            value={filters.query}
            onChange={(event) =>
              updateFilters((current) => ({
                ...current,
                query: event.target.value,
              }))
            }
            placeholder="예: 성기사, 태초회귀"
            className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/30 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </div>

        <div role="group" aria-label="직업 종류" className="space-y-2">
          <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">종류</p>
          <div className="flex flex-wrap gap-2">
            {KIND_OPTIONS.map((option) => (
              <FilterButton
                key={option.value}
                {...option}
                active={filters.kind === option.value}
                onSelect={(kind) =>
                  updateFilters((current) => ({ ...current, kind }))
                }
              />
            ))}
          </div>
        </div>

        <div role="group" aria-label="직군" className="space-y-2">
          <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">직군</p>
          <div className="flex flex-wrap gap-2">
            {LINE_OPTIONS.map((option) => (
              <FilterButton
                key={option.value}
                {...option}
                active={filters.line === option.value}
                onSelect={(line) =>
                  updateFilters((current) => ({ ...current, line }))
                }
              />
            ))}
          </div>
        </div>

        <div role="group" aria-label="차수" className="space-y-2">
          <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">차수</p>
          <div className="flex flex-wrap gap-2">
            {TIER_OPTIONS.map((option) => (
              <FilterButton
                key={option.value}
                {...option}
                active={filters.tier === option.value}
                onSelect={(tier) =>
                  updateFilters((current) => ({ ...current, tier }))
                }
              />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300" aria-live="polite">
          <span>{entries.length}개 중 {filteredEntries.length}개</span>
          {filteredEntries.length > 0 && (
            <span className="font-normal text-zinc-500 dark:text-zinc-400">
              {" "}· {pagination.startIndex}–{pagination.endIndex} 표시
            </span>
          )}
        </p>
        {hasActiveFilter && filteredEntries.length > 0 && (
          <button
            type="button"
            onClick={reset}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:border-amber-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
          >
            필터 초기화
          </button>
        )}
      </div>

      {filteredEntries.length > 0 ? (
        <ul className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {pagination.entries.map((entry) => (
            <li key={entry.id}>
              <Link
                href={`/manual/jobs/${entry.id}`}
                className={`${SURFACE_CARD} block h-full p-4 transition-colors hover:border-amber-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <span className="font-bold text-zinc-900 dark:text-zinc-100">
                    {entry.name}
                  </span>
                  <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                    {entry.tier === 0 ? "루트" : `${entry.tier}차`} ·{" "}
                    {entry.kind === "life" ? "생활" : "전투"} · {entry.lineLabel}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-5 text-zinc-600 dark:text-zinc-300">
                  수행: {entry.primaryStats.join(" · ") || "없음"}
                </p>
                <p className="mt-1 break-words text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                  스킬: {entry.skillNames.join(" · ") || "없음"}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className={`${SURFACE_CARD} mt-3 p-5 text-center`}>
          <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            검색 조건에 맞는 직업이 없습니다.
          </p>
          <button
            type="button"
            onClick={reset}
            className="mt-3 rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-zinc-950 hover:bg-amber-400"
          >
            필터 초기화
          </button>
        </div>
      )}
      <PaginationControls
        currentPage={pagination.currentPage}
        pageCount={pagination.pageCount}
        onSelect={setPage}
      />
    </section>
  );
}
