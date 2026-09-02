import { Card } from "@/components/ui/Card";
import { SURFACE_INSET } from "@/components/ui/surfaces";
import { timeAgoKo as timeAgo } from "@/lib/timeFormat";
import {
  marketplaceMyBidPresentation,
  sortMarketplaceMyBids,
  type MarketplaceMyBid,
} from "./marketplaceBidTracking";

const STATUS_TONE = {
  leading:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  outbid:
    "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  settling: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  won: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
  lost: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  cancelled: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
} as const;

export function MarketplaceMyBids({
  rows,
  clockMs,
  busy,
  onOpenBid,
}: {
  rows: MarketplaceMyBid[] | null;
  clockMs: number;
  busy: boolean;
  onOpenBid: (bid: MarketplaceMyBid) => void;
}) {
  if (rows === null) {
    return (
      <Card padding="md">
        <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">
          내 입찰 내역을 불러오는 중입니다.
        </p>
      </Card>
    );
  }
  if (rows.length === 0) {
    return (
      <Card padding="md">
        <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">
          아직 참여한 입찰이 없어요.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-2" aria-label="내 입찰 목록">
      {sortMarketplaceMyBids(rows, clockMs).map((bid) => {
        const presentation = marketplaceMyBidPresentation(bid, clockMs);
        return (
          <Card key={bid.id} padding="none" className="overflow-hidden">
            <div className="flex flex-wrap items-start justify-between gap-2 p-3 sm:p-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-semibold">{bid.itemName}</span>
                  {bid.quantity > 1 ? (
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      ×{bid.quantity.toLocaleString()}
                    </span>
                  ) : null}
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_TONE[presentation.key]}`}
                  >
                    {presentation.label}
                  </span>
                </div>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  마지막 입찰 {timeAgo(bid.lastBidAt)}
                </p>
              </div>
              {presentation.active ? (
                <button
                  type="button"
                  onClick={() => onOpenBid(bid)}
                  disabled={busy}
                  aria-label={`${bid.itemName} 입찰 내역`}
                  className="rounded-md border border-sky-300 bg-white px-3 py-2 text-xs font-semibold text-sky-700 disabled:opacity-50 dark:border-sky-800 dark:bg-zinc-900 dark:text-sky-300"
                >
                  입찰 내역
                </button>
              ) : null}
            </div>
            <div className="grid gap-2 border-t border-zinc-200 p-3 text-xs dark:border-zinc-700 sm:grid-cols-3">
              <div className={`${SURFACE_INSET} p-2.5`}>
                <div className="text-zinc-500 dark:text-zinc-400">내 최고 입찰</div>
                <div className="mt-0.5 font-bold tabular-nums text-sky-700 dark:text-sky-300">
                  내 최고 입찰 {bid.myHighestBid.toLocaleString()}G
                </div>
              </div>
              <div className={`${SURFACE_INSET} p-2.5`}>
                <div className="text-zinc-500 dark:text-zinc-400">현재 최고 입찰</div>
                <div className="mt-0.5 font-bold tabular-nums">
                  {bid.highestBid?.toLocaleString() ?? "없음"}
                  {bid.highestBid == null ? "" : "G"}
                </div>
              </div>
              <div className={`${SURFACE_INSET} p-2.5`}>
                <div className="text-zinc-500 dark:text-zinc-400">즉시구매가</div>
                <div className="mt-0.5 font-bold tabular-nums text-amber-700 dark:text-amber-400">
                  {bid.price.toLocaleString()}G
                </div>
              </div>
            </div>
            <p className="border-t border-zinc-200 px-3 py-2.5 text-xs font-medium dark:border-zinc-700">
              {presentation.guidance}
            </p>
          </Card>
        );
      })}
    </div>
  );
}
