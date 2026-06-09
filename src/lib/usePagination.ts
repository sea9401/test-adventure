import { useEffect, useMemo, useState } from "react";

// 목록 페이지네이션 — items 배열을 고정 크기 페이지로 자르고 현재 페이지의 항목만 반환.
// items 가 줄어 현재 페이지가 비면 자동으로 마지막 유효 페이지로 보정 (필터 변경 시 등).
export function usePagination<T>(
  items: T[],
  pageSize: number = 10,
  resetKey?: unknown,
): {
  page: number;
  pageCount: number;
  pageItems: T[];
  setPage: (n: number) => void;
  next: () => void;
  prev: () => void;
  hasNext: boolean;
  hasPrev: boolean;
} {
  const [page, setPageState] = useState(0);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));

  // resetKey 가 바뀌면(탭/정렬 등 목록 교체) 1페이지로. 미지정이면 undefined 라 변하지 않아 무효과.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPageState(0);
  }, [resetKey]);

  // items 가 변해서 현재 페이지가 빈 상태로 떨어지면 마지막 유효 페이지로 보정.
  // page=0 은 항상 유효 (빈 목록이어도 "1/1" 표시) — pageCount 가 1 인 경우 포함.
  useEffect(() => {
    if (page > pageCount - 1) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPageState(Math.max(0, pageCount - 1));
    }
  }, [page, pageCount]);

  const pageItems = useMemo(() => {
    const start = page * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page, pageSize]);

  const setPage = (n: number) => {
    setPageState(Math.max(0, Math.min(pageCount - 1, n)));
  };

  return {
    page,
    pageCount,
    pageItems,
    setPage,
    next: () => setPage(page + 1),
    prev: () => setPage(page - 1),
    hasNext: page < pageCount - 1,
    hasPrev: page > 0,
  };
}
