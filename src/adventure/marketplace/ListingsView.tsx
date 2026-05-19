"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Storefront } from "@phosphor-icons/react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { TabBar } from "@/components/ui/TabBar";
import { Pagination } from "@/components/ui/Pagination";
import { usePagination } from "@/lib/usePagination";
import { fetchListings } from "./api";
import type { ItemKind, Listing, SortMode } from "./types";
import { ListingCard } from "./ListingCard";

type KindFilter = "all" | ItemKind;

const KIND_TABS: { key: KindFilter; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "equip", label: "장비" },
  { key: "material", label: "재료" },
  { key: "recipe", label: "제작서" },
  { key: "skill_book", label: "스킬북" },
];

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: "recent", label: "최신순" },
  { value: "price_asc", label: "가격↑" },
  { value: "price_desc", label: "가격↓" },
];

// 등급 필터 — vault variant 키 + 라벨 + 가치 내림차순 정렬 순서.
// (장비 매물만 의미 있음 — kind 가 'equip' 또는 'all' 일 때만 노출.)
type VariantKeyFilter = "all" | "base" | "c-2" | "c-1" | "c1" | "c2" | "d1" | "d2";
const VARIANT_OPTIONS: { value: VariantKeyFilter; label: string }[] = [
  { value: "all", label: "전체 등급" },
  { value: "c2", label: "걸작 (+2)" },
  { value: "d2", label: "빼어난" },
  { value: "c1", label: "고급 (+1)" },
  { value: "d1", label: "정교한" },
  { value: "base", label: "일반" },
  { value: "c-1", label: "하급 (−1)" },
  { value: "c-2", label: "불량 (−2)" },
];

export function ListingsView({
  refreshKey,
  onCancelListing,
  onBuyListing,
  mineOnly = false,
  currentGold,
  knownRecipes,
}: {
  refreshKey: number;
  onCancelListing?: (listing: Listing) => Promise<void>;
  onBuyListing?: (listing: Listing) => Promise<void>;
  mineOnly?: boolean;
  currentGold?: number;
  knownRecipes?: string[];
}) {
  const [kind, setKind] = useState<KindFilter>("all");
  const [variantKey, setVariantKey] = useState<VariantKeyFilter>("all");
  const [sort, setSort] = useState<SortMode>("recent");
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  // 장비 외 종류로 바꾸면 등급 필터는 의미 없으니 자동으로 초기화.
  const variantFilterApplicable = kind === "all" || kind === "equip";

  const [items, setItems] = useState<Listing[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 장비 필터를 풀어도 등급 선택은 무시 (서버 400 회피).
  const effectiveVariantKey = variantFilterApplicable ? variantKey : "all";

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const r = await fetchListings(
          {
            kind,
            variantKey: effectiveVariantKey,
            sort,
            q: submitted,
            mine: mineOnly,
          },
          signal,
        );
        if (signal?.aborted) return;
        setItems(r.items);
        setNextCursor(r.nextCursor);
      } catch (e) {
        if (signal?.aborted) return;
        if (e instanceof DOMException && e.name === "AbortError") return;
        setError(e instanceof Error ? e.message : "로드 실패");
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [kind, effectiveVariantKey, sort, submitted, mineOnly],
  );

  useEffect(() => {
    // 의존성(필터/정렬/검색)이 빠르게 바뀔 때 늦게 도착한 응답이 최신 결과를 덮어쓰지
    // 않도록 AbortController 로 이전 fetch 를 취소.
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(controller.signal);
    return () => controller.abort();
  }, [load, refreshKey]);

  // 창에 포커스 돌아왔을 때 자동 새로고침. 짧은 시간(<10s) 안의 중복은 스킵.
  // useRef 초기값은 순수해야 하므로 Date.now() 는 effect 에서 세팅.
  const lastLoadedAt = useRef<number>(0);
  useEffect(() => {
    lastLoadedAt.current = Date.now();
  }, [items]);
  useEffect(() => {
    const onFocus = () => {
      if (Date.now() - lastLoadedAt.current < 10_000) return;
      void load();
    };
    const onVisible = () => {
      if (!document.hidden) onFocus();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const pager = usePagination(items, 10);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const r = await fetchListings({
        kind,
        variantKey: effectiveVariantKey,
        sort,
        q: submitted,
        mine: mineOnly,
        cursor: nextCursor,
      });
      setItems((prev) => [...prev, ...r.items]);
      setNextCursor(r.nextCursor);
    } catch (e) {
      setError(e instanceof Error ? e.message : "더 불러오기 실패");
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="space-y-3">
      <Card padding="sm">
        <TabBar
          tabs={KIND_TABS}
          active={kind}
          onChange={setKind}
          ariaLabel="아이템 종류 필터"
          size="sm"
        />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSubmitted(query.trim());
          }}
          className="mt-3 flex flex-wrap gap-2"
        >
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="아이템 이름 검색"
            className="flex-1 min-w-[140px] rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
          {variantFilterApplicable && (
            <select
              value={variantKey}
              onChange={(e) => setVariantKey(e.target.value as VariantKeyFilter)}
              aria-label="등급 필터"
              className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              {VARIANT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortMode)}
            aria-label="정렬"
            className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-md border border-zinc-900 bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
          >
            검색
          </button>
        </form>
      </Card>

      {error ? (
        <Card padding="sm">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="shrink-0 rounded-md border border-red-300 bg-white px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:bg-zinc-900 dark:text-red-400 dark:hover:bg-red-950/30"
            >
              {loading ? "재시도 중…" : "다시 시도"}
            </button>
          </div>
        </Card>
      ) : null}

      {loading && items.length === 0 ? (
        <Card padding="md">
          <Skeleton rows={3} />
        </Card>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Storefront size={40} weight="duotone" />}
          title="등록된 매물이 없습니다"
          message={submitted ? "검색어를 바꿔 보세요." : "첫 매물을 등록해 보세요."}
        />
      ) : (
        <div className="space-y-2">
          {pager.pageItems.map((it) => (
            <ListingCard
              key={it.id}
              item={it}
              onCancel={onCancelListing}
              onBuy={onBuyListing}
              currentGold={currentGold}
              alreadyKnown={
                it.itemKind === "recipe" &&
                !!knownRecipes?.includes(it.itemId)
              }
            />
          ))}
          <Pagination
            page={pager.page}
            pageCount={pager.pageCount}
            setPage={pager.setPage}
          />
        </div>
      )}

      {nextCursor ? (
        <button
          type="button"
          onClick={loadMore}
          disabled={loadingMore}
          className="block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
        >
          {loadingMore ? "더 불러오는 중…" : "더 보기"}
        </button>
      ) : null}
    </div>
  );
}
