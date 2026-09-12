"use client";

import { useEffect, useState } from "react";
import { BookmarkSimple } from "@phosphor-icons/react";

export const MARKETPLACE_WATCHLIST_KEY = "adventure.marketplace.watchlist.v1";
const WATCHLIST_LIMIT = 200;
export type MarketplaceWatchlist = { ids: Set<number>; toggle: (id: number) => void };

export function useMarketplaceWatchlist() {
  const [ids, setIds] = useState<Set<number>>(() => new Set());
  const [only, setOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(MARKETPLACE_WATCHLIST_KEY) ?? "[]");
      if (Array.isArray(saved)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- 브라우저 저장소는 마운트 후 읽는다.
        setIds(new Set(saved.filter(id => typeof id === "number" && Number.isSafeInteger(id) && id > 0).slice(0, WATCHLIST_LIMIT)));
      }
    } catch { /* 잘못된 저장값은 빈 목록으로 시작한다. */ }
  }, []);
  const save = (next: Set<number>) => {
    setIds(next);
    try {
      localStorage.setItem(MARKETPLACE_WATCHLIST_KEY, JSON.stringify([...next]));
      setError(null);
    } catch { setError("관심 매물을 브라우저에 저장하지 못했어요. 화면을 나가면 선택이 사라질 수 있어요."); }
  };
  const toggle = (id: number) => {
    if (!ids.has(id) && ids.size >= WATCHLIST_LIMIT) {
      setError(`관심 매물은 최대 ${WATCHLIST_LIMIT}개까지 저장할 수 있어요.`);
      return;
    }
    const next = new Set(ids);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    save(next);
  };
  return { ids, toggle, only, setOnly, error, clear: () => save(new Set()) };
}

export function MarketplaceWatchButton({ listing, watchlist }: {
  listing: { id: number; itemName: string };
  watchlist?: MarketplaceWatchlist;
}) {
  if (!watchlist) return null;
  const selected = watchlist.ids.has(listing.id);
  return <button type="button" aria-pressed={selected}
    aria-label={`${listing.itemName} 관심 매물 ${selected ? "해제" : "추가"}`}
    title="이 매물만 관심 목록에 저장"
    onClick={() => watchlist.toggle(listing.id)}
    className="shrink-0 rounded-md p-1.5 text-sky-700 hover:bg-sky-100 dark:text-sky-300 dark:hover:bg-sky-950">
    <BookmarkSimple size={17} weight={selected ? "fill" : "regular"} />
  </button>;
}


export function MarketplaceWatchFilter({ watchlist }: {
  watchlist: ReturnType<typeof useMarketplaceWatchlist>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <button type="button" aria-pressed={watchlist.only}
        onClick={() => watchlist.setOnly(value => !value)}
        className={`rounded-md border px-3 py-2 font-medium ${watchlist.only
          ? "border-sky-700 bg-sky-700 text-white dark:border-sky-500 dark:bg-sky-700"
          : "border-sky-300 bg-white text-sky-700 dark:border-sky-700 dark:bg-zinc-900 dark:text-sky-300"}`}>
        {watchlist.only ? "관심 매물만 보는 중" : "관심 매물만 보기"}
      </button>
      {watchlist.only && <>
        <span className="text-zinc-600 dark:text-zinc-400">이 브라우저에 저장한 {watchlist.ids.size}개 중 판매 중인 매물만 표시해요.</span>
        {watchlist.ids.size > 0 && <button type="button" onClick={watchlist.clear} className="rounded-md border border-zinc-300 px-2 py-1.5 dark:border-zinc-700">관심 매물 비우기</button>}
      </>}
      {watchlist.error && <span role="alert">{watchlist.error}</span>}
    </div>
  );
}
