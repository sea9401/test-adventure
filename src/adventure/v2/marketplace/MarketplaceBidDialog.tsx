"use client";

import { remainingLabel } from "@/adventure/v2/marketplace/listingPresentation";
import {
  type Listing
} from "@/adventure/v2/marketplace/marketplaceShared";
import { NumberInput } from "@/components/ui/NumberInput";
import { SURFACE_INSET } from "@/components/ui/surfaces";
import { timeAgoKo as timeAgo } from "@/lib/timeFormat";

export function BidDialog({
  listing,
  bids,
  amount,
  onAmountChange,
  busy,
  clockMs,
  onSubmit,
  onClose,
}: {
  listing: Listing;
  bids: Array<{ amount: number; createdAt: string; isMine: boolean }>;
  amount: string;
  onAmountChange: (value: string) => void;
  busy: boolean;
  clockMs: number;
  onSubmit: () => void;
  onClose: () => void;
}) {
  const bidding = new Date(listing.bidEndsAt).getTime() > clockMs;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-base font-bold">공개 입찰</h2>
        <div className="mt-1 text-sm font-medium">{listing.itemName}</div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className={`${SURFACE_INSET} p-2.5`}>
            <div className="text-zinc-500 dark:text-zinc-400">시작 입찰가</div>
            <div className="mt-0.5 font-bold tabular-nums text-amber-700 dark:text-amber-400">
              {listing.price.toLocaleString()}G
            </div>
          </div>
          <div className={`${SURFACE_INSET} p-2.5`}>
            <div className="text-zinc-500 dark:text-zinc-400">현재 최고 입찰</div>
            <div className="mt-0.5 font-bold tabular-nums text-sky-700 dark:text-sky-300">
              {listing.highestBid?.toLocaleString() ?? "없음"}
              {listing.highestBid != null ? "G" : ""}
            </div>
          </div>
        </div>
        <div className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
          {bidding
            ? `경매 종료까지 ${remainingLabel(listing.bidEndsAt, clockMs)} · 다음 최소 입찰 ${listing.nextBid.toLocaleString()}G`
            : listing.highestBid != null
              ? "입찰이 종료되어 최고 입찰자에게 전체 매물이 낙찰됩니다."
              : "입찰 없이 종료되어 판매자에게 전체 매물이 반환됩니다."}
        </div>

        <div className="mt-4 max-h-44 space-y-1 overflow-y-auto" aria-label="공개 입찰 기록">
          {bids.length === 0 ? (
            <div className="rounded-md border border-dashed border-zinc-300 px-3 py-4 text-center text-xs text-zinc-400 dark:border-zinc-700">
              아직 입찰이 없습니다.
            </div>
          ) : (
            [...bids].reverse().map((bid, index) => (
              <div
                key={`${bid.createdAt}:${bid.amount}:${index}`}
                className="flex items-center justify-between rounded-md bg-zinc-100 px-3 py-2 text-xs dark:bg-zinc-800"
              >
                <span className="font-semibold tabular-nums">
                  {bid.amount.toLocaleString()}G
                  {bid.isMine ? " · 내 입찰" : ""}
                </span>
                <span className="text-zinc-400">{timeAgo(bid.createdAt)}</span>
              </div>
            ))
          )}
        </div>

        {bidding && !listing.isMine ? (
          <div className="mt-4 flex gap-2">
            <NumberInput
              value={amount}
              onValueChange={onAmountChange}
              placeholder="입찰 금액"
              className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm tabular-nums dark:border-zinc-700 dark:bg-zinc-950"
            />
            <button
              type="button"
              onClick={onSubmit}
              disabled={busy}
              className="rounded-md border border-sky-700 bg-sky-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              입찰
            </button>
          </div>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          className="mt-3 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700"
        >
          닫기
        </button>
      </div>
    </div>
  );
}
