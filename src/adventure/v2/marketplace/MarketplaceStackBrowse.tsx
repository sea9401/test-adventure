"use client";

import { ChartLine, Cube, Flask, Star } from "@phosphor-icons/react";
import { Card } from "@/components/ui/Card";
import { SURFACE_INSET } from "@/components/ui/surfaces";
import type { Listing } from "./marketplaceShared";

function remainingLabel(endsAt: string, clockMs: number) {
  const remainingMs = Math.max(0, new Date(endsAt).getTime() - clockMs);
  const totalMinutes = Math.ceil(remainingMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}시간 ${minutes}분 남음`;
  return `${minutes}분 남음`;
}

export function MarketplaceStackBrowse({
  listings,
  clockMs,
  busy,
  favoriteKeys,
  onToggleFavorite,
  onBid,
  onOpenTools,
}: {
  listings: Listing[];
  clockMs: number;
  busy: boolean;
  favoriteKeys: Set<string>;
  onToggleFavorite: (key: string) => void;
  onBid: (listing: Listing) => void;
  onOpenTools: (listing: Listing) => void;
}) {
  return (
    <div className="space-y-2">
      {listings.map((listing) => {
        const key = `${listing.kind}:${listing.itemId}`;
        const favorite = favoriteKeys.has(key);
        const ended = new Date(listing.bidEndsAt).getTime() <= clockMs;
        const ListingIcon = listing.kind === "material" ? Cube : Flask;
        return (
          <Card
            key={listing.id}
            padding="none"
            className="overflow-hidden"
          >
            <div
              data-testid="marketplace-stack-listing"
              className="flex items-start gap-3 p-3 sm:p-4"
            >
              <div
                className={`${SURFACE_INSET} flex h-11 w-11 shrink-0 items-center justify-center text-sky-700 dark:text-sky-300`}
              >
                <ListingIcon size={23} weight="duotone" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold">
                      {listing.itemName}
                    </div>
                    <div className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                      {listing.quantity.toLocaleString()}개 전체 · 등록 건별 낙찰
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onOpenTools(listing)}
                      className="inline-flex items-center gap-1 rounded-md border border-sky-200 bg-white px-2 py-1.5 text-[10px] font-semibold text-sky-700 dark:border-sky-800 dark:bg-zinc-900 dark:text-sky-300"
                    >
                      <ChartLine size={14} />
                      시세·알림
                    </button>
                    <button
                      type="button"
                      onClick={() => onToggleFavorite(key)}
                      aria-label={`${listing.itemName} 즐겨찾기 ${favorite ? "해제" : "추가"}`}
                      className="rounded-md p-1.5 text-amber-500 transition hover:bg-amber-50 dark:hover:bg-amber-950"
                    >
                      <Star size={17} weight={favorite ? "fill" : "regular"} />
                    </button>
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 border-t border-zinc-200 pt-2 text-[11px] dark:border-zinc-700 sm:grid-cols-3">
                  <div>
                    <div className="text-zinc-500 dark:text-zinc-400">
                      묶음 시작가
                    </div>
                    <div className="font-bold tabular-nums text-amber-700 dark:text-amber-400">
                      {listing.price.toLocaleString()}G
                    </div>
                  </div>
                  <div>
                    <div className="text-zinc-500 dark:text-zinc-400">
                      현재 입찰
                    </div>
                    <div className="font-semibold tabular-nums text-sky-700 dark:text-sky-300">
                      {listing.highestBid == null
                        ? "입찰 없음"
                        : `${listing.highestBid.toLocaleString()}G`}
                    </div>
                  </div>
                  <div>
                    <div className="text-zinc-500 dark:text-zinc-400">
                      다음 최소 입찰가
                    </div>
                    <div className="font-semibold tabular-nums">
                      {listing.nextBid.toLocaleString()}G
                    </div>
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
                    {ended
                      ? "입찰 종료 · 정산 중"
                      : remainingLabel(listing.bidEndsAt, clockMs)}
                  </span>
                  {ended ? null : listing.isMine ? (
                    <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      내 경매 · 입찰 {listing.bidCount}건
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onBid(listing)}
                      disabled={busy}
                      aria-label={`${listing.itemName} ${listing.quantity}개 묶음 입찰`}
                      className="rounded-md border border-sky-700 bg-sky-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      입찰
                    </button>
                  )}
                </div>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
