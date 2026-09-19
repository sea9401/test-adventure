"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BookmarkSimple } from "@phosphor-icons/react";
import { MARKETPLACE_WATCHLIST_LIMIT, parseWatchIds } from "@/adventure/data/v2/marketplaceWatchlist";

export const MARKETPLACE_WATCHLIST_KEY = "adventure.marketplace.watchlist.v1";
export type MarketplaceWatchlist = { ids: Set<number>; toggle: (id: number) => void; pending?: boolean };

const ENDPOINT = "/api/v2/marketplace/watchlist";
export function useMarketplaceWatchlist() {
  const [ids, setIds] = useState<Set<number>>(() => new Set());
  const [only, setOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(true);
  const [ready, setReady] = useState(false);
  const [legacyIds, setLegacyIds] = useState<number[]>([]);
  const busy = useRef(false);
  const request = useCallback(async (body?: object) => {
    if (busy.current) return false;
    busy.current = true;
    setPending(true);
    try {
      const response = await fetch(ENDPOINT, body
        ? { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
        : { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.ok || !Array.isArray(data.ids)) {
        throw new Error(data.error === "watchlist_limit" ? "limit" : "request");
      }
      setIds(new Set(parseWatchIds(data.ids)));
      setReady(true);
      setError(null);
      return true;
    } catch (cause) {
      setError(cause instanceof Error && cause.message === "limit"
        ? `관심 매물은 최대 ${MARKETPLACE_WATCHLIST_LIMIT}개까지 저장할 수 있어요.`
        : body ? "관심 매물을 계정에 저장하지 못했어요. 다시 시도해 주세요."
          : "계정의 관심 매물을 불러오지 못했어요. 다시 시도해 주세요.");
      return false;
    } finally {
      busy.current = false;
      setPending(false);
    }
  }, []);
  useEffect(() => {
    // 저장소와 서버는 클라이언트 마운트 이후 읽는다.
    let active = true;
    const refresh = () => { void request(); };
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    void Promise.resolve().then(() => {
      if (!active) return;
      try { setLegacyIds(parseWatchIds(JSON.parse(localStorage.getItem(MARKETPLACE_WATCHLIST_KEY) ?? "[]"))); } catch { /* 손상된 로컬 목록은 무시한다. */ }
      refresh();
    });
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [request]);
  const toggle = (id: number) => {
    if (!ready) return;
    return request({ action: ids.has(id) ? "remove" : "add", id });
  };
  const importLegacy = async () => {
    if (!ready || !await request({ action: "import", ids: legacyIds })) return;
    try { localStorage.removeItem(MARKETPLACE_WATCHLIST_KEY); } catch { /* 계정 저장은 완료되었다. */ }
    setLegacyIds([]);
  };
  return { ids, toggle, only, setOnly, error, pending: pending || !ready,
    loading: pending, reload: () => request(), legacyCount: legacyIds.length, importLegacy,
    clear: () => { if (ready) return request({ action: "clear" }); } };
}

export function MarketplaceWatchButton({ listing, watchlist }: {
  listing: { id: number; itemName: string };
  watchlist?: MarketplaceWatchlist;
}) {
  if (!watchlist) return null;
  const selected = watchlist.ids.has(listing.id);
  return <button type="button" aria-pressed={selected}
    aria-label={`${listing.itemName} 관심 매물 ${selected ? "해제" : "추가"}`}
    title="이 매물만 계정 관심 목록에 저장"
    disabled={watchlist.pending}
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
        <span className="text-zinc-600 dark:text-zinc-400">계정에 저장한 {watchlist.ids.size}개 중 판매 중인 매물만 표시해요.</span>
        {watchlist.ids.size > 0 && <button type="button" disabled={watchlist.pending} onClick={watchlist.clear} className="rounded-md border border-zinc-300 px-2 py-1.5 dark:border-zinc-700">관심 매물 비우기</button>}
      </>}
      {watchlist.legacyCount > 0 && <button type="button" disabled={watchlist.pending} onClick={watchlist.importLegacy}
        className="rounded-md border border-zinc-300 px-2 py-1.5 dark:border-zinc-700">이 브라우저의 관심 매물 {watchlist.legacyCount}개를 계정으로 가져오기</button>}
      {watchlist.loading && <span role="status">관심 매물 동기화 중…</span>}
      {watchlist.error && <><span role="alert">{watchlist.error}</span><button type="button" disabled={watchlist.loading} onClick={watchlist.reload}>다시 불러오기</button></>}
    </div>
  );
}
