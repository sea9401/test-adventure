"use client";

import { CaretLeft, CaretRight } from "@phosphor-icons/react";

// 목록 하단에 노출하는 페이지 네비게이션 — < 1 2 3 4 5 > 번호 버튼.
//   pageCount 가 1 이면 자체 hidden — 호출부에서 분기 안 해도 됨. usePagination 훅과 짝지어 사용.
//   페이지가 많으면 현재 페이지 주변만 보이고 양 끝은 1 … N 으로 줄여 표시(windowing).

// 표시할 페이지 번호(1-기반) 목록 + 생략 마커. page 는 0-기반.
//   pageCount ≤ 7 이면 전부, 그 이상이면 [1, …, 현재±1, …, 끝].
export function paginationRange(
  page: number,
  pageCount: number,
): (number | "ellipsis")[] {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, i) => i + 1);
  }
  const cur = page + 1; // 1-기반
  const pages = [...new Set([1, pageCount, cur - 1, cur, cur + 1])]
    .filter((p) => p >= 1 && p <= pageCount)
    .sort((a, b) => a - b);
  const out: (number | "ellipsis")[] = [];
  for (let i = 0; i < pages.length; i++) {
    if (i > 0 && pages[i] - pages[i - 1] > 1) out.push("ellipsis");
    out.push(pages[i]);
  }
  return out;
}

const NAV_BTN =
  "flex h-10 min-w-10 items-center justify-center rounded-md border px-2 text-xs font-medium tabular-nums transition-colors disabled:cursor-not-allowed disabled:opacity-40";

export function Pagination({
  page,
  pageCount,
  setPage,
  className,
}: {
  page: number;
  pageCount: number;
  setPage: (n: number) => void;
  className?: string;
}) {
  if (pageCount <= 1) return null;
  const hasPrev = page > 0;
  const hasNext = page < pageCount - 1;
  const range = paginationRange(page, pageCount);
  return (
    <div
      className={`flex flex-wrap items-center justify-center gap-1.5 pt-2 ${className ?? ""}`}
      role="navigation"
      aria-label="페이지 네비게이션"
    >
      <button
        type="button"
        onClick={() => setPage(page - 1)}
        disabled={!hasPrev}
        aria-label="이전 페이지"
        className={`${NAV_BTN} border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800`}
      >
        <CaretLeft size={16} weight="bold" />
      </button>
      {range.map((p, i) =>
        p === "ellipsis" ? (
          <span
            key={`e${i}`}
            className="px-1 text-xs text-zinc-400 dark:text-zinc-600"
            aria-hidden
          >
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => setPage(p - 1)}
            aria-label={`${p} 페이지`}
            aria-current={p - 1 === page ? "page" : undefined}
            className={`${NAV_BTN} ${
              p - 1 === page
                ? "border-zinc-800 bg-zinc-800 text-white dark:border-zinc-200 dark:bg-zinc-200 dark:text-zinc-900"
                : "border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            }`}
          >
            {p}
          </button>
        ),
      )}
      <button
        type="button"
        onClick={() => setPage(page + 1)}
        disabled={!hasNext}
        aria-label="다음 페이지"
        className={`${NAV_BTN} border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800`}
      >
        <CaretRight size={16} weight="bold" />
      </button>
    </div>
  );
}
